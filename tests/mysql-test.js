'use strict';

const assert = require('assert');
const sinon = require('sinon');
const QueryBuilder = require('@janiscommerce/query-builder');

const { MySQLError } = require('./../lib');
const MySQL = require('./../index');

/* eslint-disable prefer-arrow-callback */

const sandbox = sinon.createSandbox();

describe('MySQL module', function() {

	class Model {
		getTable() {
			return 'table';
		}

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

	const mysql = new MySQL({});

	const dummyModel = new Model();
	dummyModel.dbname = 'dbname';

	after(() => {
		sandbox.restore();
	});

	describe('Save Methods', function() {

		context('when attempting to save/insert/update with valid item and fields', function() {

			beforeEach(() => {
				const knexGetter = { raw: () => true };
				sandbox.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sandbox.restore();
			});

			it('should return true if try to insert a new Item', async function() {

				sandbox.stub(QueryBuilder.prototype, 'insert').callsFake(() => {
					return [0];
				});

				const result = await mysql.insert(dummyModel, {
					id: 1,
					superhero: 'superman'
				});

				assert.equal(result, true);
			});

			it('should return false if try to insert an item that already exist', async function() {

				sandbox.stub(QueryBuilder.prototype, 'insert').rejects();

				const result = await mysql.insert(dummyModel, {
					id: 1,
					superhero: 'superman'
				});

				assert.equal(result, false);
			});

			it('should return true if try to save a new item', async function() {

				sandbox.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 1, insertId: 0 }];
				});

				const result = await mysql.save(dummyModel, {
					id: 2,
					superhero: 'batman'
				});

				assert.equal(result, true);
			});

			it('should return true if try to save an old item', async function() {

				sandbox.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 2 }];
				});

				const result = await mysql.save(dummyModel, {
					id: 1,
					superhero: 'hulk'
				});

				assert.equal(result, true);
			});


			it('should return number of rows affected if try to update using filters to match items', async function() {

				sandbox.stub(QueryBuilder.prototype, 'update').callsFake(() => {
					return 2;
				});

				const result = await mysql.update(dummyModel, {
					superhero: 'Mengano',
					filter: {
						id: { value: 10, type: 'lesser' }
					}
				});

				assert.equal(result, 2);
			});

			it('should return 0 if try to update using filters don\'t match any item', async function() {

				sandbox.stub(QueryBuilder.prototype, 'update').callsFake(() => {
					return 0;
				});

				const result = await mysql.update(dummyModel, {
					superhero: 'Mengano',
					filter: {
						id: { value: 10, type: 'greater' }
					}
				});

				assert.equal(result, 0);
			});

			it('should return 1 if try to multi-Insert a new Item', async function() {

				sandbox.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 1 }];
				});

				const result = await mysql.multiInsert(dummyModel, [{
					id: 3,
					superhero: 'hulk'
				}]);


				assert.equal(result, 1);
			});

			it('should return the quantity of new items as rows affected if try to multi-Insert new Items', async function() {

				sandbox.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 3 }];
				});

				const result = await mysql.multiInsert(dummyModel, [
					{ id: 4, superhero: 'robin' },
					{ id: 5, superhero: 'robocop' },
					{ id: 6, superhero: 'moon knight' }
				]);


				assert.equal(result, 3);
			});

			it('should return the double of quantity of new items as rows affected if try to multi-Insert Items which already exist', async function() {

				sandbox.stub(QueryBuilder.prototype, 'save').callsFake(() => {
					return [{ affectedRows: 4 }];
				});

				const result = await mysql.multiInsert(dummyModel, [
					{ id: 1, superhero: 'iroman' },
					{ id: 2, superhero: 'thor' }
				]);


				assert.equal(result, 4);
			});

		});

		context('when attempting to save/insert/update without a valid knex', function() {

			beforeEach(() => {
				const knexGetter = {};
				sandbox.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sandbox.restore();
			});

			it('should return false if try to insert', async function() {
				assert.equal(await mysql.insert(dummyModel, { id: 10, superhero: 'Green Goblin' }), false);
			});

			it('should return false if try to save', async function() {
				assert.equal(await mysql.save(dummyModel, { id: 10, superhero: 'Green Goblin' }), false);

			});

			it('should return 0 if try to update', async function() {
				assert.equal(await mysql.update(dummyModel, { superhero: 'Red Goblin', filters: { id: { value_: 1 } } }), 0);

			});

			it('should return 0 if try to multi-insert', async function() {
				assert.equal(await mysql.multiInsert(dummyModel, [{ id: 10, superhero: 'Green Goblin' }, { id: 11, superhero: 'Red Goblin' }]), false);

			});
		});

		context('when attempting to save/insert/update without a model', function() {

			beforeEach(() => {
				const knexGetter = { raw: () => true };
				sandbox.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			});

			afterEach(() => {
				sandbox.restore();
			});

			it('should return MySqlError if try to insert', async function() {
				await assert.rejects(mysql.insert(null, { id: 10, superhero: 'Green Goblin' }), { code: MySQLError.codes.INVALID_MODEL });
			});

			it('should return MySqlError if try to save', async function() {
				await assert.rejects(mysql.save(null, { id: 10, superhero: 'Green Goblin' }), { code: MySQLError.codes.INVALID_MODEL });

			});

			it('should return MySqlError if try to update', async function() {
				await assert.rejects(mysql.update(null, { superhero: 'Red Goblin', filters: { id: { value_: 1 } } }),
					{ code: MySQLError.codes.INVALID_MODEL });

			});

			it('should return MySqlError if try to multi-insert', async function() {
				await assert.rejects(mysql.multiInsert(null, [{ id: 10, superhero: 'Green Goblin' }, { id: 11, superhero: 'Red Goblin' }]),
					{ code: MySQLError.codes.INVALID_MODEL });

			});
		});

	});

	describe('Get Methods', function() {

		let stubGet;

		beforeEach(() => {
			const knexGetter = { raw: () => true };
			sandbox.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			stubGet = sandbox.stub(QueryBuilder.prototype, 'get');
		});

		afterEach(() => {
			sandbox.restore();
			stubGet.restore();
		});

		const testParams = (params, expectedParams) => {
			assert.deepEqual(params, expectedParams, 'shouldn\'t modify ofiginal params');
		};

		it('Get Totals in empty Table, should return default values', async function() {

			stubGet.callsFake(() => [{ count: 0 }]);

			const totalExpected = {
				page: 1,
				pageSize: 500,
				pages: 1,
				total: 0
			};

			assert.deepEqual(await mysql.getTotals(dummyModel), totalExpected);
		});

		it('Should return empty results and totals with zero values', async function() {

			const params = {};

			stubGet.callsFake(() => []);

			const result = await mysql.get(dummyModel, params);

			assert.deepEqual(result, []);

			const resultTotals = await mysql.getTotals(dummyModel);

			assert.deepEqual(resultTotals, { total: 0, pages: 0 });

			testParams(params, {});


		});

		it('Should return results and totals only with filters', async function() {

			const originalParams = { someFilter: 'foo' };
			const params = { ...originalParams };

			stubGet.callsFake(() => [{ result: 1 }, { result: 2 }]);

			const result = await mysql.get(dummyModel, params);

			assert.deepEqual(result, [{ result: 1 }, { result: 2 }]);

			testParams(params, originalParams);

			stubGet.callsFake(() => [{ count: 650 }]);

			const resultTotals = await mysql.getTotals(dummyModel);

			assert.deepEqual(resultTotals, {
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

			assert.deepEqual(result, [{ result: 1 }, { result: 2 }]);

			testParams(params, originalParams);

			stubGet.callsFake(() => [{ count: 650 }]);

			const resultTotals = await mysql.getTotals(dummyModel);

			assert.deepEqual(resultTotals, {
				total: 650,
				page: 4,
				pageSize: 10,
				pages: 65
			});
		});

		it('Should throws Error when try to get with no model', async function() {
			await assert.rejects(mysql.get(), { code: MySQLError.codes.INVALID_MODEL });

			await assert.rejects(mysql.getTotals(), { code: MySQLError.codes.INVALID_MODEL });

		});
	});

	describe('Remove methods', function() {

		let stubRemove;

		beforeEach(() => {
			const knexGetter = { raw: () => true };
			sandbox.stub(MySQL.prototype, 'knex').get(() => knexGetter);
			stubRemove = sandbox.stub(QueryBuilder.prototype, 'remove');
		});

		afterEach(() => {
			sandbox.restore();
			stubRemove.restore();
		});

		it('should return Error with no model', async function() {

			await assert.rejects(mysql.remove(), { code: MySQLError.codes.INVALID_MODEL });

		});

		it('should throw when no filters as object given', async function() {

			await assert.rejects(mysql.remove(dummyModel), MySQLError.codes.INVALID_DATA);

		});

		it('should remove when valid fields given', async function() {

			stubRemove.callsFake(() => [{ affectedRows: 1 }]);

			const results = await mysql.remove(dummyModel, {
				filters: { id: 1 }
			});

			assert.equal(results, 1);
		});

		it('should return 0 if can not remove', async function() {

			stubRemove.rejects();

			const results = await mysql.remove(dummyModel, {
				filters: { id: 1 }
			});

			assert.equal(results, 0);
		});
	});

});
