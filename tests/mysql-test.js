'use strict';

const assert = require('assert');
const sinon = require('sinon');

const QueryBuilder = require('@janiscommerce/query-builder');

const { MySQLError } = require('./../mysql');
const MySQL = require('./../index');

/* eslint-disable prefer-arrow-callback */

const sanitizeQuery = string => string.replace(/[\n\t]/g, ' ')
	.replace(/\s+/g, ' ')
	.trim();

describe('MySQL', function() {

	let stubKnex;
	let stubBuild;

	let dummyModel;

	let fullTableName;

	const mysql = new MySQL({});

	class Model {
		getTable() {
			return 'table';
		}
	}

	const knexGetter = () => {};

	before(() => {

		stubKnex = sinon.stub(MySQL.prototype, 'knex').get(() => knexGetter);

		stubBuild = sinon.stub(QueryBuilder.prototype, 'build').callsFake(() => {
			return true;
		});

		dummyModel = new Model();
		dummyModel.dbname = 'dbname';

		fullTableName = `${dummyModel.dbname}.${dummyModel.getTable()}`;
	});

	after(() => {
		stubKnex.restore();
		stubBuild.restore();
	});

	describe('static getters', () => {
		it('should return default limit', () => {
			const DEFAULT_LIMIT = 500;

			assert.equal(DEFAULT_LIMIT, MySQL.defaultLimit);
		});

		it('should return max iddle timeout', () => {
			const MAX_IDDLE_TIMEOUT = 60 * 5;

			assert.equal(MAX_IDDLE_TIMEOUT, MySQL.maxIddleTimeout);
		});

		it('should return "_filters"', () => {
			assert.equal('_filters', MySQL.filters);
		});

		it('should return "_joins"', () => {
			assert.equal('_joins', MySQL.joins);
		});

		it('should return "_columns"', () => {
			assert.equal('_columns', MySQL.columns);
		});

	});

	describe('connecionPool - setter and getter', function() {

		it('should return empty object when no pool connection was set', () => {

			assert(typeof MySQL.connectionPool, 'Object');

			assert.deepEqual({}, MySQL.connectionPool, 'it should by {}');
		});

		it('should set a connection', function() {

			const threadId = 123;

			MySQL.connectionPool = { threadId };

			assert(typeof MySQL.connectionPool, 'Object');

			assert(typeof MySQL.connectionPool[threadId], 'Object');

			assert(typeof MySQL.connectionPool[threadId].lastActivity, 'number');

			const now = Date.now() / 1000 | 0;

			assert(MySQL.connectionPool[threadId].lastActivity >= now);

			assert.equal(MySQL.connectionPool[threadId].id, threadId);

		});

	});

	describe('save methods', function() {

		let stubFields;
		let stubCall;
		const insertId = 345;

		before(() => {

			const fields = {};
			['id', 'foo', 'date_created', 'date_modified'].forEach(field => { fields[field] = field; });
			fields.date_test = { Field: 'date_test', Type: 'datetime' };

			stubFields = sinon.stub(MySQL.prototype, 'getFields')
				.returns(fields);

			stubCall = sinon.stub(MySQL.prototype, 'call')
				.returns({ insertId });
		});

		afterEach(() => {
			stubCall.resetHistory();
		});

		after(() => {
			stubFields.restore();
			stubCall.restore();
		});

		describe('should save/insert/update', function() {

			it('when attempting to save with valid fields', async function() {

				const result = await mysql.save(dummyModel, {
					foo: 'bar',
					wrongField: 2
				});

				const expectedQuery = sanitizeQuery(`INSERT INTO ${fullTableName}
					(foo, date_created, date_modified)
					VALUES (:foo, :date_created, :date_modified)
					ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), foo = VALUES(foo), date_modified = VALUES(date_modified)`);

				assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);

				assert.equal(result, insertId);
			});

			it('when attempting to insert with valid fields', async function() {

				const result = await mysql.insert(dummyModel, {
					foo: 'bar',
					dateCreated: (Date.now() / 1000 | 0),
					wrongField: 4
				});

				const expectedQuery = sanitizeQuery(`INSERT INTO ${fullTableName}
					(foo, date_created, date_modified)
					VALUES (:foo, :date_created, :date_modified)`);

				assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);

				assert.equal(result, insertId);
			});

			it('when attempting to update with valid fields', async function() {

				await mysql.update(dummyModel, {
					foo: 'bar'
				});

				const expectedQuery = sanitizeQuery(`UPDATE ${fullTableName}
					SET foo = :set_foo`);

				assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);
				assert.deepEqual(stubCall.args[0][1], { set_foo: 'bar' });
			});

			it('when attempting to update with valid fields and filter', async function() {

				await mysql.update(dummyModel, {
					_filters: { foo: 'barr' },
					foo: 'bar',
					date_test: true
				});

				const expectedQuery = sanitizeQuery(`UPDATE ${fullTableName}
					SET foo = :set_foo, date_test = NOW()
					WHERE foo = :foo`);

				assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);
				assert.deepEqual(stubCall.args[0][1], { set_foo: 'bar', foo: 'barr' });
			});

		});

		describe('should throw', function() {

			it('when attempting to save and fields not found in table structure', async function() {
				await assert.rejects(() => mysql.save(dummyModel, { wrongField: 23 }), MySQLError);
			});

			it('when attempting to update and fields not found in table structure', async function() {
				await assert.rejects(() => mysql.update(dummyModel, { wrongField: 23 }), MySQLError);
			});

		});
	});

	describe('get() getTotals()', function() {

		const stubExecute = result => sinon.stub(QueryBuilder.prototype, 'execute').callsFake(() => result);

		const testParams = (params, expectedParams) => {
			assert.deepEqual(params, expectedParams, 'shouldn\'t modify ofiginal params');
		};

		it('Should return empty results and totals with zero values', async function() {

			const params = {};

			const stub = stubExecute([]);

			const result = await mysql.get(dummyModel, params);

			assert.deepEqual(result, []);

			const resultTotals = await mysql.getTotals(dummyModel);

			assert.deepEqual(resultTotals, { total: 0, pages: 0 });

			testParams(params, {});

			stub.restore();
		});

		it('Should return results and totals', async function() {

			const originalParams = { someFilter: 'foo', page: 4, limit: 10 };
			const params = { ...originalParams };

			const stubResults = stubExecute([{ result: 1 }, { result: 2 }]);

			const result = await mysql.get(dummyModel, params);

			assert.deepEqual(result, [{ result: 1 }, { result: 2 }]);

			testParams(params, originalParams);

			stubResults.restore();

			const stubTotals = stubExecute([{ count: 650 }]);

			const resultTotals = await mysql.getTotals(dummyModel);

			assert.deepEqual(resultTotals, {
				total: 650,
				page: 4,
				pageSize: 10,
				pages: 65
			});

			stubTotals.restore();
		});
	});

	describe('getFields()', function() {

		it('Should return formatted fields', async function() {

			const stubCall = sinon.stub(MySQL.prototype, 'call')
				.returns([{ Field: 'foo', extra: 1 }]);

			const fields = await mysql.getFields(dummyModel);

			assert.deepEqual(fields, {
				foo: { Field: 'foo', extra: 1 }
			});

			assert.equal(stubCall.args[0][0], `SHOW COLUMNS FROM ${fullTableName}`);

			stubCall.restore();
		});
	});

	describe('remove methods', function() {

		let stubFields;
		let stubCall;

		before(() => {

			const fields = {};
			['id', 'foo', 'date_created', 'date_modified'].forEach(field => { fields[field] = field; });

			stubFields = sinon.stub(MySQL.prototype, 'getFields')
				.returns(fields);

			stubCall = sinon.stub(MySQL.prototype, 'call')
				.returns(true);
		});

		afterEach(() => {
			stubCall.resetHistory();
		});

		after(() => {
			stubFields.restore();
			stubCall.restore();
		});


		it('should throw when no filters as object given', async function() {

			await assert.rejects(() => mysql.remove(dummyModel), MySQLError);

			await Promise.all(
				[1, 'foo', ['foo', 'bar'], false, {}]
					.map(async data => assert.rejects(() => mysql.remove(dummyModel, data), MySQLError))
			);

		});

		it('should remove when valid fields given', async function() {

			await mysql.remove(dummyModel, {
				foo: 'bar'
			});

			const expectedQuery = sanitizeQuery(`
				DELETE FROM ${fullTableName}
				WHERE foo = :foo`);

			assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);
		});
	});

	describe('shouldDestroyConnectionPool', function() {

		it('should return true', function() {

			const now = Date.now() / 1000 | 0;

			const dates = [
				now - MySQL.maxIddleTimeout - 50 // 50 seconds after iddle timeout limit
			];

			dates.forEach(lastActivity => {
				assert(mysql.shouldDestroyConnectionPool(lastActivity));
			});

			assert(mysql.shouldDestroyConnectionPool());
		});

		it('should return false', function() {

			const now = Date.now() / 1000 | 0;

			const dates = [
				now - MySQL.maxIddleTimeout + 50 // 50 seconds before iddle timeout limit
			];

			dates.forEach(lastActivity => {
				assert(!mysql.shouldDestroyConnectionPool(lastActivity));
			});

		});

	});

	describe('Build field query', function() {

		it('Should build field query correctly for a single value field', function() {

			const values = [['foo', 'test'], ['bar', 1]];

			for(const [field, value] of values) {
				const rows = MySQL.buildFieldQuery(field, value);

				assert.deepEqual(rows.where, [`${field} = :${field}`]);
				assert.deepEqual(rows.placeholders, { [field]: value });
			}

		});

		it('Should build field query correctly for a single value field with added suffix to placeholder', function() {

			const values = [['foo', 'test'], ['bar', 1]];

			let index = 0;
			for(const [field, value] of values) {
				const rows = MySQL.buildFieldQuery(field, value, '', '_' + index);

				const ph = `${field}_${index}`;
				assert.deepEqual(rows.where, [`${field} = :${ph}`]);
				assert.deepEqual(rows.placeholders, { [ph]: value });

				index++;
			}

		});

		it('Should build field query correctly for field with null value', function() {

			const values = [['foo', null], ['bar', null]];

			let index = 0;
			for(const [field, value] of values) {
				const rows = MySQL.buildFieldQuery(field, value, '', '_' + index);

				const ph = `${field}_${index}`;
				assert.deepEqual(rows.where, [`${field} IS NULL`]);
				assert.deepEqual(rows.placeholders, { [ph]: value });

				index++;
			}

		});

		it('Should build field query correctly for field with multi values', function() {

			const res = MySQL.buildFieldQuery('foo', [1, '3']);

			assert.deepEqual(res.where, ['foo IN (:foo_0,:foo_1)']);
			assert.deepEqual(res.placeholders, { foo_0: 1, foo_1: '3' });

		});

		it('Should build field query correctly for field with multi values including NULL', function() {

			const res = MySQL.buildFieldQuery('foo', [1, '3', null]);
			assert.deepEqual(res.where, ['(foo IS NULL OR foo IN (:foo_0,:foo_1))']);
			assert.deepEqual(res.placeholders, { foo_0: 1, foo_1: '3' });

		});
	});

	describe('Field Mapping', function() {

		const fieldsMap = {
			order_form_id: ['orderFormId'],
			check_boolean: ['checkBoolean'],
			check_falsy: ['checkFalsy'],
			check_multiple: ['checkMulti', 'checkMultiple'],
			check_string: 'checkString',
			some_field: ['other_field']
		};


		it('Should map correctly an object', function() {

			const data = {
				orderFormId: 'yes',
				checkBoolean: true,
				checkFalsy: false,
				status: false,
				checkMultiple: true,
				CapitalField: false,
				no: 5,
				noMap: 6,
				checkString: 'string'
			};


			const result = mysql.mapFields(data, fieldsMap);

			assert.equal(result.orderFormId, undefined);
			assert.equal(result.checkBoolean, undefined);
			assert.equal(result.checkFalsy, undefined);
			assert.equal(result.checkMultiple, undefined);
			assert.equal(result.checkString, undefined);
			assert.equal(result.CapitalField, undefined);

			assert.equal(result.order_form_id, 'yes');
			assert.equal(result.check_boolean, true);
			assert.equal(result.check_falsy, false);
			assert.equal(result.check_multiple, true);
			assert.equal(result.status, false);
			assert.equal(result.capital_field, false);
			assert.equal(result.check_string, 'string');
			assert.equal(result.no_map, 6);
			assert.equal(result.no, 5);

		});

		it('Should map correctly an array of objects ', function() {

			const data = [{
				orderFormId: 'yes',
				checkBoolean: true,
				checkFalsy: false,
				status: false,
				checkMultiple: true,
				nomap: 5,
				checkString: 'string'
			}, {
				orderFormId: 'yes',
				checkBoolean: true,
				checkFalsy: false,
				status: false,
				checkMultiple: true,
				nomap: 5,
				checkString: 'string'
			}];

			const results = mysql.mapFields(data, fieldsMap);

			results.forEach(result => {
				assert.equal(result.orderFormId, undefined);
				assert.equal(result.checkBoolean, undefined);
				assert.equal(result.checkFalsy, undefined);
				assert.equal(result.checkMultiple, undefined);
				assert.equal(result.checkString, undefined);

				assert.equal(result.order_form_id, 'yes');
				assert.equal(result.check_boolean, true);
				assert.equal(result.check_falsy, false);
				assert.equal(result.check_multiple, true);
				assert.equal(result.status, false);
				assert.equal(result.check_string, 'string');
				assert.equal(result.nomap, 5);
			});

		});

		it('Should leave symbols properties unchanged', function() {

			const data = [{
				[Symbol.for('mock')]: 'symbol',
				nomap: 5
			}, {
				[Symbol.for('mock')]: 'symbol',
				nomap: 5
			}];

			const results = mysql.mapFields(data, fieldsMap);

			results.forEach(result => {
				assert.equal(result[Symbol.for('mock')], 'symbol');
				assert.equal(result.nomap, 5);
			});

		});
	});

	describe('GetConnection', () => {

		const fakeConnection = {
			config: {}
		};

		const fakePoolWithError = {
			getConnection: cb => cb(new Error('some database error'), null)
		};

		const fakePoolValid = {
			getConnection: cb => cb(null, fakeConnection)
		};

		it('should get Error when connection is not working', async() => {

			const stubPool = sinon.stub(MySQL.prototype, 'pool').get(() => fakePoolWithError);
			await assert.rejects(mysql.getConnection(), { message: 'some database error' });
			stubPool.restore();
		});

		it('should connect and add QueryFormat', async() => {
			const stubPool = sinon.stub(MySQL.prototype, 'pool').get(() => fakePoolValid);
			fakeConnection.config.queryFormat = MySQL.queryFormat;

			await assert(typeof mysql.getConnection(), 'object');
			await assert.deepEqual(await mysql.getConnection(), fakeConnection);
			stubPool.restore();
		});

	});
});
