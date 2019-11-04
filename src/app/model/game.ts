import { solveEquation } from "ant-utils";
import sample from "lodash-es/sample";
import { MainService } from "../main.service";
import { WarpAction } from "./actions/warp-action";
import { AutoBuyManager } from "./autoBuy/auto-buy-manager";
import { BugTypes } from "./bugsTypes";
import { CONSTS } from "./CONSTANTS";
import { FullUnit } from "./full-unit";
import { Malus } from "./malus";
import { AllMasteries } from "./masteries/all-masteries";
import { MasteryTypes } from "./masteries/mastery";
import { AllPrestige } from "./prestige/all-prestige";
import { Price } from "./price";
import { ProductionBonus } from "./production-bonus";
import { Stats } from "./stats/stats";
import { Tabs } from "./tabs";
import { UnitGroup } from "./unit-group";
import { Ants } from "./units/ants";
import { Bees } from "./units/bees";
import { Buildings } from "./units/buildings";
import { Engineers } from "./units/engineers";
import { Gatherers } from "./units/gatherers";
import { Helpers } from "./units/helpers";
import { MalusKiller } from "./units/malus-killer";
import { Materials } from "./units/materials";
import { Researches } from "./units/researches";
import { Special } from "./units/special";
import { Wasps } from "./units/wasps";
import { Workers } from "./units/workers";
import { WorldBonus } from "./units/world-bonus";
import { WorldMalus } from "./units/world-malus";
import { World } from "./world";

const STARTING_FOOD = new Decimal(100);
export const ADDITIONAL_PRICE1 = new Decimal(1e4);
export const ADDITIONAL_PRICE2 = new Decimal(1e9);
const MAX_UPDATE_TRY = 20;

export class Game {
  units = new Array<FullUnit>();
  unlockedUnits = new Array<FullUnit>();

  unitGroups = new Array<UnitGroup>();
  unlockedGroups = new Array<UnitGroup>();

  isPaused = false;
  tabs: Tabs;

  //#region UnitGroups
  materials: Materials;
  gatherers: Gatherers;
  advWorkers: Workers;
  buildings: Buildings;
  engineers: Engineers;
  killers: MalusKiller;
  ants: Ants;
  bees: Bees;
  wasps: Wasps;
  helpers: Helpers;

  researches: Researches;
  worldBonus: WorldBonus;
  worldMalus: WorldMalus;
  special: Special;
  //#endregion

  lastUnitUrl: string = "nav/unit/f";

  currentWorld = new World();
  nextWorlds = new Array<World>();
  canTravel = false;

  maxLevel = new Decimal(5);
  realMaxLevel = new Decimal(5);
  experience: FullUnit;
  time: FullUnit;
  allPrestige: AllPrestige;

  canBuyResearch = false;

  actMin: WarpAction;
  actHour: WarpAction;

  autoBuyManager: AutoBuyManager;
  stats: Stats;
  allMateries: AllMasteries;
  maxTimeBank = new Decimal(0);
  firstEndingUnit: FullUnit;

  upNumber = 0;

  constructor(public ms: MainService) {
    this.tabs = new Tabs();

    //#region Declarations
    this.materials = new Materials(this);
    this.unitGroups.push(this.materials);

    this.researches = new Researches(this.ms.researchEmitter, this);

    this.ants = new Ants(this);
    this.unitGroups.push(this.ants);

    this.bees = new Bees(this);
    this.unitGroups.push(this.bees);

    this.wasps = new Wasps(this);
    this.unitGroups.push(this.wasps);

    this.gatherers = new Gatherers(this);
    this.unitGroups.push(this.gatherers);

    this.advWorkers = new Workers(this);
    this.unitGroups.push(this.advWorkers);

    this.buildings = new Buildings(this);
    this.unitGroups.push(this.buildings);

    this.engineers = new Engineers(this);
    this.unitGroups.push(this.engineers);

    this.worldMalus = new WorldMalus(this);
    this.unitGroups.push(this.worldMalus);

    this.killers = new MalusKiller(this);
    this.unitGroups.push(this.killers);

    this.special = new Special(this);
    this.unitGroups.push(this.special);

    this.helpers = new Helpers(this);
    this.unitGroups.push(this.helpers);

    this.unitGroups.forEach(g => g.declareStuff());

    this.advWorkers.additionalBuyPreces = [
      new Price(this.materials.soil, ADDITIONAL_PRICE1)
    ];

    this.researches.declareStuff();
    this.worldBonus = new WorldBonus();
    this.worldBonus.declareStuff();

    this.experience = new FullUnit("prest");
    this.experience.reset = () => {
      //  Do nothing !
      //  Intended
    };
    this.time = new FullUnit("time");
    this.time.reset = () => {
      //  Do nothing !
      //  Intended
    };

    //#endregion
    //#region Build Lists
    this.unitGroups
      .map(g => g.list)
      .forEach(l => l.forEach(u => this.units.push(u)));
    this.units.push(this.experience, this.time);

    //#endregion
    //#region Relations
    this.unitGroups.forEach(g => g.setRelations());

    this.researches.setRelations(this.materials.science, this);
    this.researches.team1.toUnlock.push(this.advWorkers.firstResearch);

    this.worldBonus.setRelations(this);
    //#endregion
    //#region Worlds
    this.worldBonus.addWorlds();
    this.unitGroups.forEach(g => g.addWorlds());
    //#endregion
    //#region Prestige
    this.allPrestige = new AllPrestige();
    this.allPrestige.declareStuff(this);
    //#endregion
    //#region Time Warp
    this.actMin = new WarpAction(60, this);
    this.actHour = new WarpAction(3600, this);
    //#endregion
    //#region Assign team and twin research to actions
    this.units.forEach(u => {
      if (u.teamAction) u.teamAction.requiredResearch = this.researches.team2;
      if (u.twinAction) u.twinAction.requiredResearch = this.researches.twin;
    });
    //#endregion
    //#region Autobuyers
    this.autoBuyManager = new AutoBuyManager();
    this.units.filter(u => u.hasAutoBuyer).forEach(u => {
      if (!!u.buyAction) {
        this.autoBuyManager.createFromUnit(u, this);
      } else {
        u.hasAutoBuyer = false;
      }
    });
    this.autoBuyManager.createSpecial(this);
    //#endregion

    this.allMateries = new AllMasteries(this);
    this.stats = new Stats();

    //#region Worlds
    this.generateWorlds();
    this.currentWorld = new World("home");
    this.currentWorld.name = "Home World";
    this.currentWorld.level = new Decimal(1);
    this.currentWorld.winConditions.push(
      new Price(this.materials.food, CONSTS.BASE_WIN_CONDITION_MATERIALS)
    );
    this.currentWorld.setLevel(new Decimal(1), this);
    this.setStartingStuff();
    //#endregion
    //#region Special Stuff
    this.researches.mastery.onBuy = () => {
      this.allMateries.totalEarned++;
      this.allMateries.masteryPoint++;
      this.researches.masteryResDone++;
    };
    this.materials.science.productionsBonus.push(
      new ProductionBonus(this.experience, new Decimal(1))
    );
    this.setMaxTimeBank();
    this.units.forEach(u => {
      if (u.teamAction) u.teamAction.teamRes = this.researches.team2;
      if (u.twinAction) u.twinAction.twinRes = this.researches.twin;
    });
    // Extreme
    this.researches.overNineThousand.onBuy = () => {
      const malus = [
        this.worldMalus.foodMalus1,
        this.worldMalus.soilMalus1,
        this.worldMalus.crystalMalus1,
        this.worldMalus.scienceMalus1
      ].filter(m => !this.currentWorld.notWinConditions.includes(m));
      this.currentWorld.notWinConditions.push(sample(malus));

      this.currentWorld.setMalus();
      this.currentWorld.name = "Extreme " + this.currentWorld.name;

      this.currentWorld.prestige = this.currentWorld.prestige
        .times(1.1)
        .floor();
      this.currentWorld.winConditions.forEach(w => {
        w.price = w.price.times(1.2).floor();
      });
      this.worldMalus.unlocked.forEach(m => {
        if (m instanceof Malus) {
          m.isKilled = false;
          m.efficiency = 100;
          m.quantity = m.quantity.times(10);
          if (m.produces.length === 1 && m.producedBy.length === 1) {
            m.quantity = m.quantity.times(20);
          }
          if (m.produces.length === 0) m.quantity = m.quantity.times(200);
        }
      });
      this.buildLists();
      this.killers.unlocked.forEach(k => {
        k.efficiency = 100;
      });
    };
    //#endregion

    //#region Debug
    // this.materials.list.forEach(u => (u.unlocked = true));
    // this.unitGroups.forEach(g => g.list.forEach(u => u.unlock()));
    // this.tabs.tabList.forEach(t => (t.unlocked = true));
    // this.worldMalus.foodMalus1.quantity = new Decimal(100);
    // this.worldMalus.foodMalus1.quantity = new Decimal(100);
    // this.worldMalus.foodMalus2.quantity = new Decimal(10);
    // this.experience.quantity = new Decimal(1000);
    // this.allMateries.masteryPoint = 30;
    // this.experience.quantity = new Decimal(1e10);
    // this.units.forEach(u => {
    //   u.isNew = false;
    // });
    // this.researches.team1.unlocked = true;
    // this.researches.team1.done = true;
    // this.researches.team1.complete = true;
    // this.researches.team1.quantity = new Decimal(1);
    // this.researches.team1.toUnlock.forEach(u => u.unlock());
    // this.researches.team2.unlocked = true;
    // this.researches.team2.done = true;
    // this.researches.team2.quantity = new Decimal(1);
    // this.researches.team2.complete = true;
    // this.researches.team2.toUnlock.forEach(u => u.unlock());
    // this.researches.twin.unlocked = true;
    // this.researches.twin.done = true;
    // this.researches.twin.quantity = new Decimal(1);
    // this.researches.twin.complete = true;
    // this.researches.twin.toUnlock.forEach(u => u.unlock());
    // this.time.quantity = new Decimal(100);

    // console.log("World Prefix: " + World.prefix.length);
    // console.log("World Biomes: " + World.biome.length);
    // console.log("World Suffix: " + World.suffix.length);

    //#endregion

    this.unitGroups.forEach(g => g.check(true));
    this.unitGroups.forEach(g => (g.selected = g.list.filter(u => u.unlocked)));
    this.buildLists();
  }
  buildLists() {
    this.unlockedUnits = [];
    this.units.forEach(u => {
      if (u instanceof FullUnit && u.unlocked) this.unlockedUnits.push(u);
    });
    const oldNum = this.unlockedGroups.length;
    this.unlockedGroups = this.unitGroups.filter(g => g.unlocked.length > 0);
    // tslint:disable-next-line:triple-equals
    if (this.ms.options.materialPosition == 2) {
      this.unlockedGroups = this.unlockedGroups.filter(
        m => m !== this.materials
      );
    }
    if (oldNum !== this.unlockedGroups.length) {
      this.ms.unlockGroupEmiter.emit(this.unlockedGroups.length);
    }
  }
  setMaxTimeBank() {
    this.maxTimeBank = this.allPrestige.time.timeBank.quantity
      .times(3600)
      .plus(7200)
      .times(
        1 +
          0.5 * this.allMateries.getSum(MasteryTypes.TIME_BANK) +
          2 * this.allMateries.getSum(MasteryTypes.TIME_GEN_AND_BANK)
      );
  }
  /**
   * Update game and add time
   * @param delta time passed in milliseconds
   */
  updateWithTime(delta: number) {
    const timePerSec = this.allPrestige.time.timeProducer.quantity
      .div(10)
      .times(
        1 +
          0.3 * this.allMateries.getSum(MasteryTypes.TIME_GEN) +
          2 * this.allMateries.getSum(MasteryTypes.TIME_GEN_AND_BANK)
      );
    if (isNaN(this.time.quantity.toNumber())) {
      this.time.quantity = new Decimal(0);
    }

    this.time.quantity = this.time.quantity
      .plus(timePerSec.times(delta / 1000))
      .min(this.maxTimeBank);

    this.time.c = timePerSec;
    this.update(delta);
  }
  /**
   * Update function.
   * Works only with resource growing at max rate of x^3
   * When something reach zero consumers are stopped and it will update again
   * @param delta in milliseconds
   * @param force force update, used for warp in pause
   */
  update(delta: number, force = false) {
    this.upNumber++;
    if (this.upNumber > MAX_UPDATE_TRY) {
      this.ms.toastr.error(
        "Error: infinite loop.",
        "Please report to developer."
      );
      return;
    }

    let maxTime = delta;
    let unitZero: FullUnit = null;
    this.firstEndingUnit = null;

    this.unlockedUnits.forEach(u => {
      u.isEnding = false;
      u.endIn = Number.POSITIVE_INFINITY;
    });

    this.reloadProduction();

    for (const unit of this.unlockedUnits) {
      //#region get polynom
      unit.tempA = new Decimal(0);
      unit.tempB = new Decimal(0);
      unit.tempC = new Decimal(0);
      const d = unit.quantity;

      for (const prod1 of unit.producedBy.filter(p => p.producer.isActive())) {
        // x
        const prodX = prod1.prodPerSec;
        unit.tempC = unit.tempC.plus(prodX.times(prod1.producer.quantity));

        for (const prod2 of prod1.producer.producedBy.filter(p =>
          p.producer.isActive()
        )) {
          // x^2
          const prodX2 = prod2.prodPerSec.times(prodX);
          unit.tempB = unit.tempB.plus(prodX2.times(prod2.producer.quantity));

          for (const prod3 of prod2.producer.producedBy.filter(p =>
            p.producer.isActive()
          )) {
            // x^3
            const prodX3 = prod3.prodPerSec.times(prodX2);
            unit.tempA = unit.tempA.plus(prodX3.times(prod3.producer.quantity));
          }
        }
      }
      unit.tempA = unit.tempA.div(6);
      unit.tempB = unit.tempB.div(2);
      if (!unit.tempA.eq(unit.a)) unit.a = unit.tempA;
      if (!unit.tempB.eq(unit.b)) unit.b = unit.tempB;
      if (!unit.tempC.eq(unit.c)) unit.c = unit.tempC;
      //#endregion

      if (unit.a.lt(0) || unit.b.lt(0) || unit.c.lt(0) || d.lt(0)) {
        const solution = solveEquation(unit.a, unit.b, unit.c, d).filter(s =>
          s.gte(0)
        );

        if (solution.length > 0) {
          const min = solution.reduce(
            (p, c) => p.min(c),
            new Decimal(Number.POSITIVE_INFINITY)
          );
          if (maxTime > min.toNumber() * 1000) {
            maxTime = min.toNumber() * 1000;
            unitZero = unit;
          }
          unit.endIn = Math.min(min.times(1000).toNumber(), unit.endIn);
          unit.isEnding = true;
          if (
            !(unit instanceof Malus) &&
            (!this.firstEndingUnit || this.firstEndingUnit.endIn > unit.endIn)
          ) {
            this.firstEndingUnit = unit;
          }
        }
      }
    }

    this.unlockedUnits
      .filter(u => u.endIn > 0)
      .forEach(u => (u.endIn = u.endIn - maxTime));

    if (!this.isPaused || force) {
      if (maxTime > 10) {
        this.update2(new Decimal(maxTime).div(1000));
      }

      // Something has ended
      if (unitZero) {
        //  Stop consumers
        unitZero.producedBy.filter(p => p.ratio.lt(0)).forEach(p => {
          p.producer.efficiency = 0;
        });
        unitZero.producedBy.filter(p => p.ratio.gt(0)).forEach(p => {
          p.producer.producedBy.filter(p2 => p2.ratio.lt(0)).forEach(p2 => {
            p2.producer.efficiency = 0;
          });
        });

        //  Kill Malus
        if (unitZero instanceof Malus) {
          if (unitZero.kill()) {
            this.ms.toastr.success("", unitZero.name + " killed!");
          }
        } else {
          if (!this.ms.options.noResourceEndPopUp) {
            this.ms.toastr.warning(unitZero.name + " ended!");
          }
        }
      }

      const remaining = delta - maxTime;
      if (remaining > 10) {
        // this.reloadProduction();
        this.update(remaining);
      }
    }
  }
  /**
   * Sub Update function.
   * @param seconds time in seconds
   */
  update2(seconds: Decimal) {
    this.unlockedUnits
      .filter(u => !u.a.eq(0) || !u.b.eq(0) || !u.c.eq(0))
      .forEach(u => {
        u.quantity = u.quantity
          .plus(u.a.times(Decimal.pow(seconds, 3)))
          .plus(u.b.times(Decimal.pow(seconds, 2)))
          .plus(u.c.times(seconds));
      });
    this.unlockedUnits.forEach(u => {
      u.quantity = u.quantity.max(0);
    });
  }
  /**
   *  Reload actions costs
   *  and eventually fix quantity > 0
   */
  postUpdate(time) {
    this.upNumber = 0;
    this.worldMalus.foodMalus1.reloadPriceMulti();
    this.worldMalus.soilMalus1.reloadPriceMulti();
    this.worldMalus.crystalMalus1.reloadPriceMulti();
    this.worldMalus.scienceMalus1.reloadPriceMulti();

    this.unlockedUnits.forEach(u => {
      u.quantity = u.quantity.max(0);
    });
    if (!this.isPaused) this.autoBuyManager.update(time);

    this.researches.toDo.forEach(u => u.reload());
    this.canBuyResearch = !!this.researches.toDo.find(
      r =>
        r.unlocked &&
        r.canBuy &&
        (!r.unlimited || r.quantity.lt(r.maxAutoBuyLevel))
    );
    this.unlockedUnits.forEach(u => {
      u.actions.forEach(a => a.reload());
    });
    const team = this.researches.team2.done;
    const twin = this.researches.twin.done;
    this.unitGroups.forEach(g => g.setFlags(team, twin));

    this.canTravel = this.currentWorld.canTravel();
    if (!this.researches.travel.done) this.canTravel = false;

    this.actHour.reload();
    this.actMin.reload();
  }
  /**
   * Time Warp
   * @param delta in milliseconds
   */
  warp(delta: number) {
    if (delta > 0) {
      if (!this.ms.options.noWarpNotification) {
        this.ms.toastr.info(this.ms.endInPipe.transform(delta), "Time Warp");
      }
      this.update(delta, true);
      //this.autoBuyManager.update(delta);
    }
  }
  /**
   * Calculate production per second
   */
  reloadProduction() {
    const teamPrestigeBonus = this.allPrestige.team.betterTeam.quantity
      .times(0.3)
      .times(1 + this.allMateries.getSum(MasteryTypes.TEAM_PRESTIGE))
      .plus(1);

    this.unlockedUnits.forEach(u => {
      u.reloadTeamBonus(this.researches.team1.done, teamPrestigeBonus);
      u.produces.forEach(p => p.reloadProdPerSec(this.researches.team1.done));
    });
  }
  /**
   * Apply world bonus
   */
  applyWorldBonus() {
    this.worldBonus.reset();
    this.currentWorld.productionsBonus.forEach(b => {
      b[0].quantity = new Decimal(b[1]);
      b[0].unlocked = true;
    });
    this.currentWorld.productionsAll.forEach(b => {
      b[0].quantity = new Decimal(b[1]);
      b[0].unlocked = true;
    });
    this.currentWorld.productionsEfficiency.forEach(b => {
      b[0].quantity = new Decimal(b[1]);
      b[0].unlocked = true;
    });
  }
  setStartingStuff() {
    this.materials.food.unlocked = true;
    this.materials.food.quantity = STARTING_FOOD;
    this.ants.queen.unlocked = true;
    this.ants.queen.quantity = new Decimal(1);
    this.ants.larva.unlocked = true;
    this.ants.larva.quantity = new Decimal(10);
    this.gatherers.drone.unlocked = true;
    this.gatherers.drone.quantity = new Decimal(1);
  }
  /**
   * Prestige, reset everything except prestige stuff
   * and move to another world
   * @param world chosen world
   */
  goToWorld(world: World): boolean {
    this.stats.logWorldCompleted(this.currentWorld, !this.canTravel);

    if (this.canTravel && this.hasSecondMastery()) {
      this.allMateries.totalEarned++;
      this.allMateries.masteryPoint++;
    }

    const newPrestige = this.experience.quantity.plus(
      this.currentWorld.prestige
    );

    this.units.forEach(u => u.reset());
    this.worldBonus.reset();
    this.materials.food.quantity = new Decimal(STARTING_FOOD);
    this.ants.queen.quantity = new Decimal(1);
    this.ants.larva.unlocked = true;
    this.gatherers.drone.unlocked = true;
    this.materials.food.unlocked = true;

    //  Update Experience
    if (this.canTravel) {
      this.experience.quantity = newPrestige;
      this.maxLevel = this.maxLevel
        .plus(this.currentWorld.level.div(3))
        .floor()
        .plus(1);
    }

    this.currentWorld = world;
    this.setStartingStuff();
    this.applyWorldBonus();
    this.researches.reset(this.materials.science);

    //#region Followers
    const followerMulti =
      this.allMateries.getSum(MasteryTypes.MORE_FOLLOWERS) + 1;
    const followerMultiGa =
      this.allMateries.getSum(MasteryTypes.MORE_FOLLOWERS_GA) * 3;
    const followerMultiWo =
      this.allMateries.getSum(MasteryTypes.MORE_FOLLOWERS_WO) * 3;

    this.units.filter(u => u.follower).forEach(u => {
      u.quantity = u.quantity.plus(
        u.follower.quantity.times(u.followerQuantity).times(followerMulti)
      );
      if (u.quantity.gt(0.5)) {
        u.unlock();
        if (u.buyAction && u.buyAction.toUnlock) {
          u.buyAction.toUnlock.forEach(a => a.unlock());
        }
      }
    });
    this.gatherers.list.filter(u => u.follower).forEach(u => {
      u.quantity = u.quantity.plus(
        u.follower.quantity.times(u.followerQuantity).times(followerMultiGa)
      );
    });
    this.advWorkers.list.filter(u => u.follower).forEach(u => {
      u.quantity = u.quantity.plus(
        u.follower.quantity.times(u.followerQuantity).times(followerMultiWo)
      );
    });
    //#endregion
    //#region Starting Team && TWin
    const startTeam = this.allMateries.getSum(MasteryTypes.TEAM_START);
    if (startTeam > 0) {
      this.units
        .filter(u => u.teamAction)
        .map(u => u.teamAction)
        .forEach(t => (t.quantity = t.quantity.plus(startTeam)));
      this.researches.team1.unlocked = true;
      this.researches.team1.done = true;
      this.researches.team1.complete = true;
      this.researches.team1.quantity = new Decimal(1);
      this.researches.team1.toUnlock.forEach(u => u.unlock());
      this.researches.team2.unlocked = true;
      this.researches.team2.done = true;
      this.researches.team2.quantity = new Decimal(1);
      this.researches.team2.complete = true;
      this.researches.team2.toUnlock.forEach(u => u.unlock());
      this.materials.science.unlock();
    }
    const startTwin = this.allMateries.getSum(MasteryTypes.START_TWIN);
    if (startTwin > 0) {
      this.units
        .filter(u => u.twinAction)
        .map(u => u.twinAction)
        .forEach(t => (t.quantity = t.quantity.plus(startTwin)));
      this.researches.twin.unlocked = true;
      this.researches.twin.done = true;
      this.researches.twin.quantity = new Decimal(1);
      this.researches.twin.complete = true;
      this.researches.twin.toUnlock.forEach(u => u.unlock());
      this.materials.science.unlock();
    }
    //#endregion
    //#region Mastery && Free Warp
    this.researches.free1hWarp.unlocked =
      this.allMateries.getSum(MasteryTypes.FREE_WARP_RES) > 0;
    if (this.allMateries.getSum(MasteryTypes.START_RESEARCHS) > 0) {
      this.advWorkers.scientificMethod1.unlocked = true;
      this.advWorkers.scientificMethod1.quantity = new Decimal(4);
      this.researches.harvesting.unlocked = true;
      this.researches.harvesting.quantity = new Decimal(4);
    }
    //#endregion
    //#region other Bugs
    if (this.currentWorld.additionalBugs.includes(BugTypes.BEE)) {
      this.bees.larva.unlocked = true;
      this.bees.queen.unlocked = true;
      this.bees.larva.quantity = new Decimal(10);
      this.bees.queen.quantity = new Decimal(1);
      this.gatherers.foraggingBee.unlocked = true;
    }
    if (this.currentWorld.additionalBugs.includes(BugTypes.WASP)) {
      this.wasps.larva.unlocked = true;
      this.wasps.queen.unlocked = true;
      this.wasps.larva.quantity = new Decimal(10);
      this.wasps.queen.quantity = new Decimal(1);
      this.gatherers.foraggingWasp.unlocked = true;
    }
    if (this.currentWorld.additionalBugs.includes(BugTypes.SUPER_MAJOR)) {
      this.gatherers.hunter.unlocked = true;
    }
    //#endregion

    this.currentWorld.setGame();

    this.researches.reloadLists();
    this.unitGroups.forEach(g => g.check());
    this.buildLists();
    this.generateWorlds();

    this.tabs.prestige.unlock();

    if (this.ms.kongregate) setTimeout(this.ms.sendKong.bind(this.ms), 10);

    this.autoBuyManager.buildActiveList();
    return true;
  }
  hasSecondMastery(): boolean {
    return (
      this.researches.overNineThousand.done &&
      this.currentWorld.level.gt(15) &&
      this.currentWorld.level.gt(this.maxLevel.times(0.5))
    );
  }
  refundAutoBuyers() {
    const refExp = this.autoBuyManager.getTotalSkillSpent();
    this.experience.quantity = this.experience.quantity.plus(refExp);
    this.autoBuyManager.reset();
  }
  //#region Unit Utils
  generateWorlds(userMin: Decimal = null, userMax: Decimal = null) {
    this.reloadMaxLevel();

    if (userMin == null) userMin = new Decimal(1);
    if (userMax == null) userMax = this.realMaxLevel;

    userMax = Decimal.min(userMax, this.realMaxLevel);

    this.nextWorlds = [
      World.getRandomWorld(userMin, userMax, this),
      World.getRandomWorld(userMin, userMax, this),
      World.getRandomWorld(userMin, userMax, this)
    ];
  }
  genSciencePrice(price: Decimal | number, growRate = 1): Price[] {
    return [new Price(this.materials.science, new Decimal(price), growRate)];
  }
  genExperiencePrice(price: Decimal | number, growRate = 1.3): Price[] {
    return [new Price(this.experience, new Decimal(price), growRate)];
  }
  addTeamAction(unit: FullUnit, price: Decimal | number) {
    unit.generateTeamAction(this.genTeamPrice(price));
  }
  addTwinAction(unit: FullUnit, price: Decimal | number) {
    unit.generateTwinAction(this.genTwinPrice(price));
  }
  reloadMaxLevel() {
    this.realMaxLevel = this.maxLevel.times(
      this.allPrestige.worldPrestige.maxLevel.quantity
        .times(0.1)
        .times(
          1 + 0.5 * this.allMateries.getSum(MasteryTypes.WORLD_LEVEL_PRESTIGE)
        )
        .plus(1)
    );
    // const masteryMulti = this.allMateries.getSum(MasteryTypes.WORLD_LEVEL);
    // this.realMaxLevel = this.realMaxLevel.times(1 + masteryMulti / 2).floor();
  }
  //#endregion
  //#endregion
  //#region Save and Load
  getSave(): any {
    return {
      u: this.units.map(u => u.getSave()),
      t: this.tabs.getSave(),
      r: this.researches.getSave(),
      w: this.currentWorld.getSave(),
      p: this.allPrestige.getSave(),
      m: this.maxLevel,
      a: this.isPaused,
      abm: this.autoBuyManager.getSave(),
      s: this.stats.getSave(),
      mas: this.allMateries.getSave(),
      wor: this.nextWorlds.map(w => w.getSave())
    };
  }
  restore(data: any): boolean {
    if ("u" in data) {
      for (const s of data.u) this.units.find(u => u.id === s.i).restore(s);
      if ("t" in data) this.tabs.restore(data.t);
      if ("mas" in data) this.allMateries.restore(data.mas);
      if ("r" in data) this.researches.restore(data.r, this.materials.science);
      if ("w" in data) this.currentWorld.restore(data.w, this);
      if ("p" in data) this.allPrestige.restore(data.p);
      if ("m" in data) this.maxLevel = new Decimal(data.m);
      if ("a" in data) this.isPaused = data.a;
      if ("abm" in data) this.autoBuyManager.restore(data.abm);
      if ("s" in data) this.stats.restore(data.s);
      if ("wor" in data) {
        this.nextWorlds = data.wor.map(w => {
          const newW = new World("");
          newW.restore(w, this);
          return newW;
        });
      }

      //
      //  Debug
      //
      // this.materials.list.forEach(m => (m.quantity = new Decimal(1e100)));
      // this.materials.food.quantity = new Decimal(100);
      // this.ants.nest.quantity = new Decimal(70);
      // this.experience.quantity = new Decimal(1e10);
      // this.allMateries.masteryPoint = 100;
      // this.researches.spawn.unlocked = true;
      // this.advWorkers.betterWorkers.unlocked = true;
      // this.advWorkers.efficientWorkers.unlocked = true;
      //
      //
      //

      this.unitGroups.forEach(g => g.check());
      this.buildLists();
      this.unitGroups.forEach(
        g => (g.selected = g.list.filter(u => u.unlocked))
      );

      this.applyWorldBonus();
      this.reloadProduction();
      this.setMaxTimeBank();
      return true;
    } else {
      return false;
    }
  }
  //#endregion

  //#region Price Utility
  private genTeamPrice(price: Decimal | number): Price[] {
    return [new Price(this.materials.science, new Decimal(price), 4)];
  }
  private genTwinPrice(price: Decimal | number): Price[] {
    return [new Price(this.materials.science, new Decimal(price), 10)];
  }
}
