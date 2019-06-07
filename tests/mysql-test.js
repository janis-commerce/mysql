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

		it('should return "_columns"', () => {
			assert(mysql.pool);
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

			stubFields = sinon.stub(MySQL.prototype, '_getFields')
				.returns(fields);

			stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns([{ insertId }]);
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

			it('if getFields not return id, date_created and date_modified', async() => {

				const fields2 = { some: 'some' };
				stubFields.returns(fields2);

				const result = await mysql.insert(dummyModel, {
					some: 'bar'
				}, false);

				const expectedQuery = sanitizeQuery(`INSERT INTO ${fullTableName}
					(some) VALUES (:some)`);

				assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);

				assert.equal(result, insertId);

			});

		});

		describe('should throw', function() {

			it('when attempting to save with no model', async() => {
				await assert.rejects(mysql.save(), { code: MySQLError.codes.INVALID_MODEL });

			});

			it('when attempting to update with no model', async() => {
				await assert.rejects(mysql.update(), { code: MySQLError.codes.INVALID_MODEL });

			});

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

		it('Get Totals in empty Table, should return default values', async() => {

			const stub2 = sinon.stub(MySQL.prototype, 'get').callsFake(() => [{ count: 0 }]);

			const totalExpected = {
				page: 1,
				pageSize: 500,
				pages: 1,
				total: 0
			};

			assert.deepEqual(await mysql.getTotals(dummyModel), totalExpected);

			stub2.restore();
		});

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

		it('Should return results and totals only with filters', async function() {

			const originalParams = { someFilter: 'foo' };
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
				page: 1,
				pageSize: 500,
				pages: 2
			});

			stubTotals.restore();
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

		it('Should throws Error when try to get with no model', async() => {
			await assert.rejects(mysql.get(), { code: MySQLError.codes.INVALID_MODEL });

			await assert.rejects(mysql.getTotals(), { code: MySQLError.codes.INVALID_MODEL });

		});
	});

	describe('getFields()', function() {

		it('Should return formatted fields', async function() {

			const stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns([[{ Field: 'foo', extra: 1 }]]);

			const fields = await mysql._getFields(dummyModel);

			assert.deepEqual(fields, {
				foo: { Field: 'foo', extra: 1 }
			});

			assert.equal(stubCall.args[0][0], `SHOW COLUMNS FROM ${fullTableName}`);

			stubCall.restore();
		});

		it('should return Error with no model', async() => {

			await assert.rejects(mysql._getFields(), { code: MySQLError.codes.INVALID_MODEL });

		});
	});

	describe('remove methods', function() {

		let stubFields;
		let stubCall;

		before(() => {

			const fields = {};
			['id', 'foo', 'date_created', 'date_modified'].forEach(field => { fields[field] = field; });

			stubFields = sinon.stub(MySQL.prototype, '_getFields')
				.returns(fields);

			stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns(true);
		});

		afterEach(() => {
			stubCall.resetHistory();
		});

		after(() => {
			stubFields.restore();
			stubCall.restore();
		});

		it('should return Error with no model', async() => {

			await assert.rejects(mysql.remove(), { code: MySQLError.codes.INVALID_MODEL });

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

		it('should remove when valids fields given but some invalid too', async() => {
			await mysql.remove(dummyModel, {
				foo: 'bar',
				w: true
			});

			const expectedQuery = sanitizeQuery(`
				DELETE FROM ${fullTableName}
				WHERE foo = :foo`);

			assert.equal(sanitizeQuery(stubCall.args[0][0]), expectedQuery);

		});
	});

	describe('Build field query', function() {

		it('Should build field query correctly for a single value field', function() {

			const values = [['foo', 'test'], ['bar', 1]];

			for(const [field, value] of values) {
				const rows = MySQL._buildFieldQuery(field, value);

				assert.deepEqual(rows.where, [`${field} = :${field}`]);
				assert.deepEqual(rows.placeholders, { [field]: value });
			}

		});

		it('Should build field query correctly for a single value field with alias', function() {

			const values = [['foo', 'test'], ['bar', 1]];
			const alias = 'test';

			for(const [field, value] of values) {
				const rows = MySQL._buildFieldQuery(field, value, alias);

				assert.deepEqual(rows.where, [`${alias}.${field} = :${field}`]);
				assert.deepEqual(rows.placeholders, { [field]: value });
			}

		});

		it('Should build field query correctly for a single value field with added suffix to placeholder', function() {

			const values = [['foo', 'test'], ['bar', 1]];

			let index = 0;
			for(const [field, value] of values) {
				const rows = MySQL._buildFieldQuery(field, value, '', '_' + index);

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
				const rows = MySQL._buildFieldQuery(field, value, '', '_' + index);

				const ph = `${field}_${index}`;
				assert.deepEqual(rows.where, [`${field} IS NULL`]);
				assert.deepEqual(rows.placeholders, { [ph]: value });

				index++;
			}

		});

		it('Should build field query correctly for field with multi values', function() {

			const res = MySQL._buildFieldQuery('foo', [1, '3']);

			assert.deepEqual(res.where, ['foo IN (:foo_0,:foo_1)']);
			assert.deepEqual(res.placeholders, { foo_0: 1, foo_1: '3' });

		});

		it('Should build field query correctly for field with multi values including NULL', function() {

			const res = MySQL._buildFieldQuery('foo', [1, '3', null]);
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


			const result = mysql._mapFields(data, fieldsMap);

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

			const results = mysql._mapFields(data, fieldsMap);

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

			const results = mysql._mapFields(data, fieldsMap);

			results.forEach(result => {
				assert.equal(result[Symbol.for('mock')], 'symbol');
				assert.equal(result.nomap, 5);
			});

		});
	});

	describe('Prepare Fields', function() {

		const expectedPrepareFieldsEmpty = {
			where: [],
			placeholders: {},
			columns: ['*'],
			joins: ''
		};

		const expectedPrepareFields = {
			where: ['foo = :foo'],
			placeholders: { foo: 'bar' },
			columns: ['*'],
			joins: ''
		};

		it('should return Error with no model', async() => {

			await assert.rejects(mysql._prepareFields(), { code: MySQLError.codes.INVALID_MODEL });

		});

		it('should return empty fields with no fields', async() => {

			const preparedFields = await mysql._prepareFields(dummyModel);
			assert.deepEqual(preparedFields, expectedPrepareFieldsEmpty);

		});

		it('should return the correct where and placeholders fields', async() => {

			const stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns([[{ Field: 'foo' }]]);

			const preparedFields = await mysql._prepareFields(dummyModel, { foo: 'bar' });

			assert.deepEqual(preparedFields, expectedPrepareFields);

			stubCall.restore();

		});

		it('should return LEFT JOIN query if Join Type field not exist', async() => {

			const stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns([[{ Field: 'foo' }]]);

			const fakeFields = {
				foo: 'bar',
				_joins: [
					{ table: 'table_b', alias: 'tb', condition: 'foo' }
				]
			};

			const preparedFields = await mysql._prepareFields(dummyModel, fakeFields);
			expectedPrepareFields.joins = ' LEFT JOIN dbname.table_b tb ON foo';

			assert.deepEqual(preparedFields, expectedPrepareFields);

			expectedPrepareFields.joins = '';
			stubCall.restore();

		});

		it('should return empty join string if join type is \'\'', async() => {

			const stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns([[{ Field: 'foo' }]]);

			const fakeFields = {
				foo: 'bar',
				_joins: [
					{ table: 'table_b', type: '', alias: 'tb', condition: 'foo' }
				]
			};

			const preparedFields = await mysql._prepareFields(dummyModel, fakeFields);

			assert.deepEqual(preparedFields, expectedPrepareFields);

			expectedPrepareFields.joins = '';
			stubCall.restore();

		});

		it('should return RIGHT JOIN query with join type is \'RIGHT\' ', async() => {

			const stubCall = sinon.stub(MySQL.prototype, '_call')
				.returns([[{ Field: 'foo' }]]);

			const fakeFields = {
				foo: 'bar',
				_joins: [
					{ table: 'table_b', type: 'RIGHT', alias: 'tb', condition: 'foo' }
				]
			};

			const preparedFields = await mysql._prepareFields(dummyModel, fakeFields);
			expectedPrepareFields.joins = ' RIGHT JOIN dbname.table_b tb ON foo';

			assert.deepEqual(preparedFields, expectedPrepareFields);

			expectedPrepareFields.joins = '';
			stubCall.restore();

		});
	});

	describe('shouldDestroyConnectionPool', function() {

		it('should return true', function() {

			const now = Date.now() / 1000 | 0;

			const dates = [
				now - MySQL.maxIddleTimeout - 50 // 50 seconds after iddle timeout limit
			];

			dates.forEach(lastActivity => {
				assert(mysql._shouldDestroyConnectionPool(lastActivity));
			});

			assert(mysql._shouldDestroyConnectionPool());
		});

		it('should return false', function() {

			const now = Date.now() / 1000 | 0;

			const dates = [
				now - MySQL.maxIddleTimeout + 50 // 50 seconds before iddle timeout limit
			];

			dates.forEach(lastActivity => {
				assert(!mysql._shouldDestroyConnectionPool(lastActivity));
			});

		});

	});

	describe('End Connection', function() {
		it('should end the connection', function() {
			//mysql.end();
			//mysql.closeIddleConnections();
		})
	});

	describe('Calls', function() {

		const validQuery = 'SHOW COLUMNS FROM `table`';

		const queryError = new Error('Some Query Error');
		queryError.errno = 1206;
		queryError.code = 'Invalid Query';

		const connection = {
			config: {},
			query: async queryToResolve => {
				if(queryToResolve !== validQuery)
					throw queryError;

				return ([[{ Field: 'foo' }]]);
			},
			release: () => true
		};

		// const poolStub = sinon.stub(MySQL.prototype, 'pool').get( () => ({ getConnection: () => ({connection}) }));

		it('should return positives results', async() => {
			const connectionStub = sinon.stub(MySQL.prototype, 'getConnection')
				.returns(connection);

			const callQuery = await mysql._call(validQuery, {});

			assert.deepEqual(callQuery, [[{ Field: 'foo' }]]);
			connectionStub.restore();
		});

		it('should reconnect', async() => {
			const connectionStub = sinon.stub(MySQL.prototype, 'getConnection');

			connectionStub
				.onCall(0)
				.rejects(new MySQLError('Too Many Connections', MySQLError.codes.TOO_MANY_CONNECTION));

			connectionStub
				.onCall(1)
				.returns(connection);

			const callQuery = await mysql._call(validQuery, {});

			assert.deepEqual(callQuery, [[{ Field: 'foo' }]]);
			connectionStub.restore();
		});

		it('should thrown MySQLError if query is wrong/invalid ', async() => {
			const connectionStub = sinon.stub(MySQL.prototype, 'getConnection')
				.returns(connection);

			await assert.rejects(mysql._call('SOME INVALID QUERY', {}), { code: MySQLError.codes.INVALID_QUERY });

			connectionStub.restore();
		});


		it('should return MySQLError from Database', async() => {
			const connectionStub = sinon.stub(MySQL.prototype, 'getConnection')
				.rejects(new MySQLError('Database Error', MySQLError.codes.CONNECTION_ERROR));

			await assert.rejects(mysql._call(validQuery, {}), { code: MySQLError.codes.CONNECTION_ERROR });
			connectionStub.restore();
		});

	});

	describe('GetConnection', () => {

		const connection = {
			config: {}
		};

		const fakePoolValid = {
			getConnection: () => ({ connection })
		};

		it('should get Error when connection is not working', async() => {

			const stubPool = sinon.stub(MySQL.prototype, 'pool')
				.get(() => { throw new Error('Database Error'); });

			await assert.rejects(mysql.getConnection(), { code: MySQLError.codes.CONNECTION_ERROR });
			stubPool.restore();
		});

		it('should get MySqlError when Pool have too many connection', async() => {

			const SqlErrorTooManyConnection = new Error('Too Many Connection');
			SqlErrorTooManyConnection.code = 'ER_CON_COUNT_ERROR';

			const stubPool = sinon.stub(MySQL.prototype, 'pool')
				.get(() => { throw SqlErrorTooManyConnection; });

			await assert.rejects(mysql.getConnection(), { code: MySQLError.codes.TOO_MANY_CONNECTION });

			stubPool.restore();
		});

		it('should connect and add QueryFormat', async() => {
			const stubPool = sinon.stub(MySQL.prototype, 'pool').get(() => fakePoolValid);
			connection.config.queryFormat = MySQL.queryFormat;

			await assert(typeof mysql.getConnection(), 'object');
			assert.deepEqual(await mysql.getConnection(), { connection });

			stubPool.restore();
		});

	});

	describe('Query Format', function() {

		const queryString = value => `SHOW COLUMNS FROM ${value}`;

		it('should return the same Query String if value dont exist', () => {
			assert.equal(mysql._queryFormat(queryString('`table`')), queryString('`table`'));
		});

		it('should return the Query String with correct value change', () => {
			assert.equal(mysql._queryFormat(queryString(':foo'), { foo: 'bar' }), queryString('\'bar\''));
		});

		it('should return the Query String with correct value format', () => {
			assert.equal(mysql._queryFormat(queryString(':foo'), 'foo'), queryString(':foo'));
		});
	});
});
