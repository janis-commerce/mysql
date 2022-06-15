'use strict';

const assert = require('assert');
const sinon = require('sinon');
const QueryBuilder = require('@janiscommerce/query-builder');

const { MySQL, MySQLError } = require('../');

/* eslint-disable prefer-arrow-callback */

class Model {

	addDbName(t) {
		return t;
	}

	static get fields() {
		return {
			id: true,
			superhero: true
		};
	}
}

describe('MySQL module', function() {

	let mysql;
	let dummyModel;

	beforeEach(() => {
		mysql = new MySQL({});
		dummyModel = new Model();
	});

	after(() => {
		sinon.restore();
	});

	describe('Save Methods', function() {

		context('when attempting to save/insert/update with valid item and fields', function() {

			beforeEach(() => {
				const knexGetter = { raw: () => true };
				sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sinon.restore();
			});

			it('should return ID if try to insert a new Item with no Auto-Incremental ID', async function() {

				const item = {
					id: 1,
					superhero: 'superman'
				};

				sinon.stub(QueryBuilder.prototype, 'insert').callsFake(() => {
					return [0]; // Knex return this if no auto-incremental ID
				});

				const result = await mysql.insert(dummyModel, item);

				assert.strictEqual(result, item.id);
			});

			it('should return ID if try to insert a new Item with Auto-Incremental ID', async function() {

				const itemIdGenerated = 10;

				const item = {
					superhero: 'supergirl'
				};

				sinon.stub(QueryBuilder.prototype, 'insert').callsFake(() => {
					return [itemIdGenerated]; // Knex return this if no auto-incremental ID
				});

				const result = await mysql.insert(dummyModel, item);

				assert.strictEqual(result, itemIdGenerated);
			});

			it('should return ID if try to insert a new Item which has ID with Auto-Incremental ID', async function() {

				const item = {
					id: 20,
					superhero: 'Wolverine'
				};

				sinon.stub(QueryBuilder.prototype, 'insert').callsFake(() => {
					return [item.id]; // Knex return this if no auto-incremental ID
				});

				const result = await mysql.insert(dummyModel, item);

				assert.strictEqual(result, item.id);
			});

			it('should throw MySqlError if try to insert an item that already exist', async function() {

				sinon.stub(QueryBuilder.prototype, 'insert').rejects();

				const item = {
					id: 1,
					superhero: 'superman'
				};

				await assert.rejects(mysql.insert(dummyModel, item), { code: MySQLError.codes.INVALID_INSERT });
			});

			it('should return ID if try to save a new item with ID no auto-incremental', async function() {

				const item = {
					id: 2,
					superhero: 'batman'
				};

				sinon.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 1, insertId: 0 }];
				});

				const result = await mysql.save(dummyModel, item);

				assert.strictEqual(result, item.id);
			});

			it('should return ID if try to save a new item with ID auto-incremental', async function() {

				const itemIDGenerated = 2;

				const item = {
					superhero: 'batman'
				};

				sinon.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 1, insertId: itemIDGenerated }];
				});

				const result = await mysql.save(dummyModel, item);

				assert.strictEqual(result, itemIDGenerated);
			});

			it('should return ID if try to save an existing item', async function() {

				const item = {
					id: 1,
					superhero: 'hulk'
				};

				sinon.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 2, insertId: item.id }];
				});

				const result = await mysql.save(dummyModel, {
					id: 1,
					superhero: 'hulk'
				});

				assert.strictEqual(result, item.id);
			});


			it('should return number of rows affected if try to update using filters to match items', async function() {

				const fields = { superhero: 'Mengano' };
				const filters = {
					id: { value: 10, type: 'lesser' }
				};

				sinon.stub(QueryBuilder.prototype, 'update').callsFake(() => {
					return 2;
				});

				const result = await mysql.update(dummyModel, fields, filters);

				assert.strictEqual(result, 2);
			});

			it('should return 0 if try to update using filters don\'t match any item', async function() {

				const fields = { superhero: 'Mengano' };
				const filters = {
					id: { value: 10, type: 'greater' }
				};

				sinon.stub(QueryBuilder.prototype, 'update').callsFake(() => {
					return 0;
				});

				const result = await mysql.update(dummyModel, fields, filters);

				assert.strictEqual(result, 0);
			});

			it('should return 1 if try to multi-Insert a new Item', async function() {

				sinon.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 1 }];
				});

				const result = await mysql.multiInsert(dummyModel, [{
					id: 3,
					superhero: 'hulk'
				}]);


				assert.strictEqual(result, 1);
			});

			it('should return the quantity of new items as rows affected if try to multi-Insert new Items', async function() {

				sinon.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 3 }];
				});

				const result = await mysql.multiInsert(dummyModel, [
					{ id: 4, superhero: 'robin' },
					{ id: 5, superhero: 'robocop' },
					{ id: 6, superhero: 'moon knight' }
				]);


				assert.strictEqual(result, 3);
			});

			it('should return the double of quantity of new items as rows affected if try to multi-Insert Items which already exist', async function() {

				sinon.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 4 }];
				});

				const result = await mysql.multiInsert(dummyModel, [
					{ id: 1, superhero: 'iroman' },
					{ id: 2, superhero: 'thor' }
				]);


				assert.strictEqual(result, 4);
			});

		});

		context('when attempting to save/insert/update without a valid knex', function() {

			beforeEach(() => {
				const knexGetter = {};
				sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sinon.restore();
			});

			it('should return false if try to insert', async function() {
				await assert.rejects(mysql.insert(dummyModel, { id: 10, superhero: 'Green Goblin' }), { code: MySQLError.codes.INVALID_INSERT });
			});

			it('should return false if try to save', async function() {
				await assert.rejects(mysql.save(dummyModel, { id: 10, superhero: 'Green Goblin' }), { code: MySQLError.codes.INVALID_SAVE });

			});

			it('should return 0 if try to update', async function() {
				const fields = { superhero: 'Red Goblin' };
				const filters = {
					id: { value_: 1 }
				};

				await assert.rejects(mysql.update(dummyModel, fields, filters), { code: MySQLError.codes.INVALID_UPDATE });

			});

			it('should return 0 if try to multi-insert', async function() {
				const items = [
					{ id: 10, superhero: 'Green Goblin' },
					{ id: 11, superhero: 'Red Goblin' }
				];

				await assert.rejects(mysql.multiInsert(dummyModel, items), { code: MySQLError.codes.INVALID_MULTI_INSERT });

			});
		});

		context('when attempting to save/insert/update without a model', function() {

			beforeEach(() => {
				const knexGetter = { raw: () => true };
				sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sinon.restore();
			});

			it('should return MySqlError if try to insert', async function() {
				await assert.rejects(mysql.insert(null, { id: 10, superhero: 'Green Goblin' }), { code: MySQLError.codes.INVALID_MODEL });
			});

			it('should return MySqlError if try to save', async function() {
				await assert.rejects(mysql.save(null, { id: 10, superhero: 'Green Goblin' }), { code: MySQLError.codes.INVALID_MODEL });

			});

			it('should return MySqlError if try to update', async function() {
				const fields = { superhero: 'Red Goblin' };
				const filters = { id: { value_: 1 } };

				await assert.rejects(mysql.update(null, fields, filters),
					{ code: MySQLError.codes.INVALID_MODEL });

			});

			it('should return MySqlError if try to multi-insert', async function() {
				await assert.rejects(mysql.multiInsert(null, [{ id: 10, superhero: 'Green Goblin' }, { id: 11, superhero: 'Red Goblin' }]),
					{ code: MySQLError.codes.INVALID_MODEL });

			});
		});

		context('when attempting to save/insert/update with no items or values', function() {

			beforeEach(() => {
				const knexGetter = { raw: () => true };
				sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sinon.restore();
			});

			it('should return MySqlError if try to insert', async function() {
				await assert.rejects(mysql.insert(dummyModel), { code: MySQLError.codes.EMPTY_FIELDS });
			});

			it('should return MySqlError if try to save', async function() {
				await assert.rejects(mysql.save(dummyModel), { code: MySQLError.codes.EMPTY_FIELDS });

			});

			it('should return MySqlError if try to update', async function() {
				await assert.rejects(mysql.update(dummyModel), { code: MySQLError.codes.EMPTY_FIELDS });

			});

			it('should return MySqlError if try to multi-insert', async function() {
				await assert.rejects(mysql.multiInsert(dummyModel), { code: MySQLError.codes.EMPTY_FIELDS });

			});
		});

	});

	describe('Get Methods', function() {

		context('when try to get items with valid configuration', function() {

			let stubGet;

			beforeEach(() => {
				const knexGetter = { raw: () => true };
				sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
				stubGet = sinon.stub(QueryBuilder.prototype, 'get');
			});

			afterEach(() => {
				sinon.restore();
			});

			const testParams = (params, expectedParams) => {
				assert.deepStrictEqual(params, expectedParams, 'shouldn\'t modify ofiginal params');
			};

			it('should return default values getting totals with empty tables', async function() {

				stubGet.callsFake(() => [{ count: 0 }]);

				const totalExpected = {
					page: 1,
					pageSize: 500,
					pages: 1,
					total: 0
				};

				assert.deepStrictEqual(await mysql.getTotals(dummyModel), totalExpected);
			});

			it('Should return empty results and totals with zero values', async function() {

				const params = {};

				stubGet.callsFake(() => []);

				const result = await mysql.get(dummyModel, params);

				assert.deepStrictEqual(result, []);

				const resultTotals = await mysql.getTotals(dummyModel);

				assert.deepStrictEqual(resultTotals, { total: 0, pages: 0 });

				testParams(params, {});
			});

			it('Should return results and totals only with filters', async function() {

				const originalParams = { someFilter: 'foo' };
				const params = { ...originalParams };

				stubGet.callsFake(() => [{ result: 1 }, { result: 2 }]);

				const result = await mysql.get(dummyModel, params);

				assert.deepStrictEqual(result, [{ result: 1 }, { result: 2 }]);

				testParams(params, originalParams);

				stubGet.callsFake(() => [{ count: 650 }]);

				const resultTotals = await mysql.getTotals(dummyModel);

				assert.deepStrictEqual(resultTotals, {
					total: 650,
					page: 1,
					pageSize: 500,
					pages: 2
				});
			});

			it('Should return results and totals', async function() {

				const originalParams = { someFilter: 'foo', page: 4, limit: 10 };
				const params = { ...originalParams };

				stubGet.callsFake(() => [{ result: 1 }, { result: 2 }]);

				const result = await mysql.get(dummyModel, params);

				assert.deepStrictEqual(result, [{ result: 1 }, { result: 2 }]);

				testParams(params, originalParams);

				stubGet.callsFake(() => [{ count: 650 }]);

				const resultTotals = await mysql.getTotals(dummyModel);

				assert.deepStrictEqual(resultTotals, {
					total: 650,
					page: 4,
					pageSize: 10,
					pages: 65
				});
			});

			it('Should return results and totals with max number of page if try to request a higher number', async function() {

				const originalParams = { someFilter: 'foo', page: 74, limit: 10 };
				const params = { ...originalParams };

				stubGet.callsFake(() => [{ result: 1 }, { result: 2 }]);

				const result = await mysql.get(dummyModel, params);

				assert.deepStrictEqual(result, [{ result: 1 }, { result: 2 }]);

				testParams(params, originalParams);

				stubGet.callsFake(() => [{ count: 650 }]);

				const resultTotals = await mysql.getTotals(dummyModel);

				assert.deepStrictEqual(resultTotals, {
					total: 650,
					page: 65,
					pageSize: 10,
					pages: 65
				});
			});

		});

		context('when try to get items with invalid configuration', function() {

			afterEach(() => {
				sinon.restore();
			});

			it('should throw MySqlError if knex is invalid', async function() {

				sinon.stub(MySQL.prototype, 'knex').get(() => {});
				await assert.rejects(mysql.get(dummyModel, {}), { code: MySQLError.codes.INVALID_GET });

			});

			it('should throws MySqlError when try to get with no model', async function() {

				await assert.rejects(mysql.get(), { code: MySQLError.codes.INVALID_MODEL });
				await assert.rejects(mysql.getTotals(), { code: MySQLError.codes.INVALID_MODEL });

			});

		});

	});

	describe('Remove methods', function() {

		let stubRemove;

		beforeEach(() => {
			const knexGetter = { raw: () => true };
			sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			stubRemove = sinon.stub(QueryBuilder.prototype, 'remove');
		});

		afterEach(() => {
			sinon.restore();
		});

		it('should throw MySqlError with no model', async function() {

			await assert.rejects(mysql.remove(), { code: MySQLError.codes.INVALID_MODEL });

		});

		it('should throw MySqlError when no filters as object given', async function() {

			await assert.rejects(mysql.remove(dummyModel), { code: MySQLError.codes.INVALID_DATA });

		});

		it('should remove when valid fields given', async function() {

			stubRemove.callsFake(() => [{ affectedRows: 1 }]);

			const results = await mysql.remove(dummyModel, {
				filters: { id: 1 }
			});

			assert.strictEqual(results, 1);
		});

		it('should throw MySqlError if can not remove', async function() {

			stubRemove.rejects();

			const params = {
				filters: { id: 1 }
			};

			await assert.rejects(mysql.remove(dummyModel, params), { code: MySQLError.codes.INVALID_REMOVE });
		});
	});

	describe('multiRemove()', () => {

		let stubRemove;

		beforeEach(() => {
			const knexGetter = { raw: () => true };
			sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			stubRemove = sinon.stub(QueryBuilder.prototype, 'remove');
		});

		afterEach(() => {
			sinon.restore();
		});

		it('should call remove() method when multiRemove is called', async function() {
			stubRemove.callsFake(() => [{ affectedRows: 1 }]);

			const results = await mysql.multiRemove(dummyModel, [
				{ filters: { id: 1 } },
				{ filters: { id: 2 } }
			]);

			assert.deepStrictEqual(results, 2);
			sinon.assert.calledTwice(stubRemove);
		});

		it('should throw when remove() rejects when multiRemove is called', async function() {
			stubRemove.rejects();

			const params = [{
				filters: { id: 1 }
			}];

			await assert.rejects(mysql.multiRemove(dummyModel, params), { code: MySQLError.codes.INVALID_REMOVE });
		});

		it('should throw MySqlError with no model', async function() {

			await assert.rejects(mysql.multiRemove(), { code: MySQLError.codes.INVALID_MODEL });

		});

		it('should throw MySqlError when no filters as array given', async function() {

			await assert.rejects(mysql.multiRemove(dummyModel, {}), { code: MySQLError.codes.INVALID_DATA });

		});
	});

});
