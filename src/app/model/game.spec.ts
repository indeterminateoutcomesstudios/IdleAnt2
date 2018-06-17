import { TestBed, inject } from "@angular/core/testing";

import { Game } from "./game";
import { FullUnit } from "./full-unit";
import { EventEmitter } from "@angular/core";

describe("Game", () => {
  const updateEmitter = new EventEmitter<number>();
  const researchEmitter = new EventEmitter<string>();
  it("should be created", () => {
    expect(new Game(updateEmitter, researchEmitter)).toBeTruthy();
  });

  it("Save works", () => {
    const original = new Game(updateEmitter, researchEmitter);
    const second = new Game(updateEmitter, researchEmitter);

    original.units = [
      new FullUnit("id1", "name1", "desc", new Decimal(10)),
      new FullUnit("id2", "name2", "desc", new Decimal(10))
    ];
    second.units = [
      new FullUnit("id1", "name1", "desc", new Decimal(10)),
      new FullUnit("id2", "name2", "desc", new Decimal(10))
    ];

    original.units[0].unlocked = true;
    original.currentWorld.name = "world name";

    const ok = second.restore(original.getSave());

    expect(ok).toBeTruthy();
    expect(second.units[0].unlocked).toBeTruthy();
    expect(second.currentWorld.name).toBe("world name");
  });
  it("Save works 2", () => {
    const game = new Game(updateEmitter, researchEmitter);
    expect(game.restore({})).toBeFalsy();
  });

  it("Simple update", () => {
    const game = new Game(updateEmitter, researchEmitter);
    const food = new FullUnit("food", "Food", "Food");
    const farmer = new FullUnit("farmer", "Farmer", "Farmer");
    farmer.quantity = new Decimal(1);
    food.addProducer(farmer, new Decimal(1));
    food.unlocked = true;
    farmer.unlocked = true;
    game.unlockedUnits = [food, farmer];
    game.update(10 * 1e3);

    expect(food.quantity.toNumber()).toBe(10);
  });
  it("Simple update 2", () => {
    const game = new Game(updateEmitter, researchEmitter);
    const food = new FullUnit("food", "Food", "Food");
    const farmer = new FullUnit("farmer", "Farmer-", "Farmer");
    const farmer2 = new FullUnit("farmer2", "Farmer2-", "Farmer2");
    const farmer3 = new FullUnit("farmer3", "Farmer3-", "Farmer3");
    farmer.quantity = new Decimal(1);
    farmer2.quantity = new Decimal(1);
    farmer3.quantity = new Decimal(1);
    food.addProducer(farmer, new Decimal(1));
    farmer.addProducer(farmer2, new Decimal(1));
    farmer2.addProducer(farmer3, new Decimal(1));
    food.unlocked = true;
    farmer.unlocked = true;
    farmer2.unlocked = true;
    farmer3.unlocked = true;
    game.unlockedUnits = [food, farmer, farmer2, farmer3];
    game.update(10 * 1e3);

    expect(Math.floor(food.quantity.toNumber())).toBe(226);
    expect(Math.floor(farmer2.quantity.toNumber())).toBe(11);
  });
  it("Ending update 2", () => {
    const game = new Game(updateEmitter, researchEmitter);
    const food = new FullUnit("food", "Food", "Food");
    const consumer = new FullUnit("consumer", "Consumer-", "Consumer");
    const farmer = new FullUnit("farmer", "Farmer-", "Farmer");
    consumer.quantity = new Decimal(1);
    farmer.quantity = new Decimal(1);
    food.quantity = new Decimal(3);
    food.addProducer(farmer, new Decimal(1));
    food.addProducer(consumer, new Decimal(-2));
    food.unlocked = true;
    farmer.unlocked = true;
    consumer.unlocked = true;
    game.unlockedUnits = [food, consumer, farmer];
    game.update(10 * 1e3);

    expect(Math.floor(food.quantity.toNumber())).toBe(7);
    expect(consumer.efficiency).toBe(0);
    expect(farmer.efficiency).toBe(100);
  });
});
