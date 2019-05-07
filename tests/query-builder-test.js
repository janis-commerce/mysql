'use strict';

const assert = require('assert');
const sinon = require('sinon');

const { QueryBuilder, QueryBuilderError } = coreRequire('./private/database/query-builder');

/* eslint-disable prefer-arrow-callback */

const makeKnex = () => {
	class FakeKnex {}

	const knexMethods = [
		'select', 'raw', 'count', 'min', 'max', 'sum', 'avg',
		'where', 'orWhere', 'whereIn', 'whereNotIn', 'whereNot', 'whereNull', 'whereNotNull', 'whereBetween', 'whereNotBetween', 'whereRaw',
		'join', 'innerJoin', 'leftJoin', 'leftOuter', 'rightJoin', 'rightOuterJoin', 'fullOuterJoin', 'crossJoin',
		'on', 'orOn',
		'groupBy', 'groupByRaw',
		'limit', 'offset',
		'orderBy', 'orderByRaw'
	];

	knexMethods.forEach(knexMethod => { FakeKnex[knexMethod] = sinon.stub(); });

	return FakeKnex;
};

const makeKnexFunction = () => makeKnex;

function queryBuilderFactory({
	params = {},
	table = 'table',
	fields = {},
	flags = {},
	joins = {},
	knexSpy
} = {}) {

	class Model {
		static get table() {
			return table;
		}

		get dbTable() {
			return table;
		}

		static get fields() {
			return fields;
		}

		static get flags() {
			// el if es para poder testear los casos en los que los modelos NO tienen flags
			return Object.keys(flags).length > 0 ? flags : undefined;
		}

		static get joins() {
			return joins;
		}

		addDbName(t) {
			return t;
		}
	}

	const knex = knexSpy || makeKnexFunction();
	knex.raw = sinon.stub();
	const model = new Model();

	return new QueryBuilder(knex, model, params);
}

const assertThrowsWhenBuild = queryBuilder => assert.throws(() => { queryBuilder.build(); }, QueryBuilderError);

describe('QueryBuilder', function() {

	describe('constructor -', function() {

		it('Should construct a QueryBuilder with base params', function() {

			const params = { dummyParams: 1 };

			const fakeTable = 'fake_table';

			const queryBuilder = queryBuilderFactory({
				params,
				table: fakeTable
			});

			assert.equal(queryBuilder.table, fakeTable);
			assert.deepEqual(queryBuilder.fields, {});
			assert.deepEqual(queryBuilder.params, params);
		});
	});

	describe('build', function() {

		it('Should init knex with table \'foo\'', function() {

			const knexSpy = sinon.stub();
			knexSpy.returns({ select() {} });

			const queryBuilder = queryBuilderFactory({ table: 'foo', knexSpy });

			queryBuilder.build();

			assert(knexSpy.calledOnce);
			assert.deepEqual(knexSpy.args[0][0], { t: 'foo' });
		});

		it('Should build normaly when debug mode on', function() {
			const queryBuilder = queryBuilderFactory({ params: { debug: true } });
			queryBuilder.build();
		});
	});

	describe('buildSelect', function() {

		describe('Should throws', function() {
			it('when invalid params.fields passed and fields definition missed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: true },
					params: { fields: 'id' }
				});

				assertThrowsWhenBuild(queryBuilder);

				assert(queryBuilder.knexStatement.select.notCalled);
			});

			it('when \'params.fields\' not present in fields definition missed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true },
					params: { fields: ['bar'] }
				});

				assertThrowsWhenBuild(queryBuilder);

				assert(queryBuilder.knexStatement.select.notCalled);
			});

			it('when params.fields passed and fields definition missed', function() {

				const queryBuilder = queryBuilderFactory({ params: { fields: ['id'] } });

				assertThrowsWhenBuild(queryBuilder);

				assert(!queryBuilder.knexStatement.select.called);
			});

			it('when params.fields as an empty array', function() {

				const queryBuilder = queryBuilderFactory({ params: { fields: [] } });

				assertThrowsWhenBuild(queryBuilder);

				assert(!queryBuilder.knexStatement.select.called);
			});

			it('when params.fields passed as false and no select functions', function() {

				const queryBuilder = queryBuilderFactory({ params: { fields: false } });

				assertThrowsWhenBuild(queryBuilder);

				assert(!queryBuilder.knexStatement.select.called);
			});
		});

		describe('Should call knex.select()', function() {

			it('when params.fields passed and definition exists', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: true },
					params: { fields: ['id'] }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.called);
				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], { id: 't.id' });
			});

			it('when params.fields passed and complex with \'field\' definition exists', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: { field: 'bar' } },
					params: { fields: ['foo'] }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.called);
				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], { foo: 't.bar' });
			});

			it('when params.fields passed and complex with \'field\' and \'alias\' definition exists', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: { field: 'bar', alias: 'greatAlias' } },
					params: { fields: ['foo'] }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.called);
				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], { greatAlias: 't.bar' });
			});

			it('when no params.fields passed and fields definition missed', function() {

				const queryBuilder = queryBuilderFactory();

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.calledOnce);
				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], 't.*');
			});

			it('when fields definition exists but no params.fields passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: true }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.calledOnce);
				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], 't.*');
			});

			it('with t.* and model flags when no params.fields given', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: true, status: true, isActive: true, error: true },
					flags: { status: { isActive: 1, error: 2 } }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.calledTwice);

				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], 't.*');

				assert(queryBuilder.knexStatement.raw.calledOnce);

				assert.deepEqual(queryBuilder.knexStatement.raw.args[0][0], '((t.status & 1) = 1) as isActive, ((t.status & 2) = 2) as error');
			});

			it('with t.* and no flags when no fields given and noFlags param as true', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: true, status: true, isActive: true, error: true },
					flags: { status: { isActive: 1, error: 2 } },
					params: { noFlags: true }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.calledOnce);

				assert.deepEqual(queryBuilder.knexStatement.select.args[0][0], 't.*');

				assert(queryBuilder.knexStatement.raw.notCalled);
			});
		});

		describe('Shouldn\'t call knex.select()', function() {

			it('when params.fields passed as false and has select functions', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: true },
					params: { fields: false, count: true }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.notCalled);
			});
		});
	});

	describe('buildSelect - Select Functions', function() {

		describe('Shouldn\'t call knex.count()', function() {

			it('when no params.count passed', function() {

				const queryBuilder = queryBuilderFactory();

				queryBuilder.build();

				assert(queryBuilder.knexStatement.count.notCalled);
			});
		});

		describe('Should throws', function() {

			it('when params.count passed with unknown field', function() {

				const queryBuilder = queryBuilderFactory({
					params: { count: 'unknown' }
				});

				assertThrowsWhenBuild(queryBuilder);

				assert(queryBuilder.knexStatement.count.notCalled);
			});

			it('when invalid formatted params.count passed', function() {

				const invalidCounts = [
					10,
					[],
					[1],
					['foo'],
					['foo', 'bar'],
					['foo', 'bar', 10]
				];

				invalidCounts.forEach(invalidCount => {

					const queryBuilder = queryBuilderFactory({
						params: { count: invalidCount }
					});

					assertThrowsWhenBuild(queryBuilder);

					assert(queryBuilder.knexStatement.count.notCalled);
				});
			});

		});

		const selectFunctions = ['count', 'min', 'max', 'sum', 'avg'];

		selectFunctions.forEach(selectFunction => {

			describe(`Should call knex.${selectFunction} method`, function() {

				it(`when ${selectFunction} as 'true' passed`, function() {

					const queryBuilder = queryBuilderFactory({
						params: { [selectFunction]: true }
					});

					queryBuilder.build();

					assert(queryBuilder.knexStatement[selectFunction].calledOnce);
					assert.deepEqual(queryBuilder.knexStatement[selectFunction].args[0], [`* as ${selectFunction}`]);

				});

				it(`when ${selectFunction} as valid field passed`, function() {

					const queryBuilder = queryBuilderFactory({
						fields: { id: true },
						params: { [selectFunction]: 'id' }
					});

					queryBuilder.build();

					assert(queryBuilder.knexStatement[selectFunction].calledOnce);
					assert.deepEqual(queryBuilder.knexStatement[selectFunction].args[0], [`t.id as ${selectFunction}`]);

				});

				it(`when ${selectFunction} as object with valid field passed`, function() {

					const queryBuilder = queryBuilderFactory({
						fields: { id: true },
						params: { [selectFunction]: { field: 'id' } }
					});

					queryBuilder.build();

					assert(queryBuilder.knexStatement[selectFunction].calledOnce);
					assert.deepEqual(queryBuilder.knexStatement[selectFunction].args[0], [`t.id as ${selectFunction}`]);

				});

				it(`when ${selectFunction} as object with alias passed`, function() {

					const queryBuilder = queryBuilderFactory({
						params: { [selectFunction]: { alias: `${selectFunction}Alias` } }
					});

					queryBuilder.build();

					assert(queryBuilder.knexStatement[selectFunction].calledOnce);
					assert.deepEqual(queryBuilder.knexStatement[selectFunction].args[0], [`* as ${selectFunction}Alias`]);

				});

				it(`when ${selectFunction} as object with valid field and alias passed`, function() {

					const queryBuilder = queryBuilderFactory({
						fields: { id: true },
						params: { [selectFunction]: { field: 'id', alias: `${selectFunction}Alias` } }
					});

					queryBuilder.build();

					assert(queryBuilder.knexStatement[selectFunction].calledOnce);
					assert.deepEqual(queryBuilder.knexStatement[selectFunction].args[0], [`t.id as ${selectFunction}Alias`]);

				});
			});
		});
	});

	describe('buildSelect - Select Flags', function() {

		describe('Should call knex.select() and knex.raw()', function() {

			it('when params.fields with a flag passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: {
						status: true,
						isActive: true
					},
					flags: { status: { isActive: 1 } },
					params: { fields: ['isActive'] }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.select.called);
				assert(queryBuilder.knexStatement.raw.called);

				assert.deepEqual(queryBuilder.knexStatement.raw.args[0][0], '((t.status & 1) = 1) as isActive');
			});
		});
	});

	describe('buildJoins', function() {

		describe('Shouldn\'t call knex.join methods', function() {

			const joinKnexMethods = ['join', 'innerJoin', 'leftJoin', 'leftOuter', 'rightJoin', 'rightOuterJoin', 'fullOuterJoin', 'crossJoin'];

			const assertShouldntJoin = queryBuilderParams => {
				const queryBuilder = queryBuilderFactory(queryBuilderParams);

				queryBuilder.build();

				joinKnexMethods.forEach(method => {
					assert(queryBuilder.knexStatement[method].notCalled);
				});
			};

			it('when no \'params.joins\' passed or fields and join definition missing', function() {
				assertShouldntJoin();
			});

			it('when \'params.joins\' passed but fields and join definition missing', function() {

				assertShouldntJoin({
					params: { joins: ['foo'] }
				});
			});

			it('when \'params.joins\' passed but fields definition missing', function() {

				assertShouldntJoin({
					params: { joins: ['foo'] },
					joins: { foo: { alias: 'f', on: ['fieldA', 'fieldB'] } }
				});
			});
		});

		describe('Should throws', function() {

			const assertThrowsBuildJoins = queryBuilderParams => {
				const queryBuilder = queryBuilderFactory(queryBuilderParams);
				assert.throws(() => { queryBuilder.build(); }, QueryBuilderError, JSON.stringify(queryBuilderParams));
			};

			it('when invalid \'params.joins\' passed', function() {

				assertThrowsBuildJoins({
					params: { joins: 'foo' },
					fields: { foo: true }
				});
			});

			it('when \'params.joins\' passed but join definition missing', function() {

				assertThrowsBuildJoins({
					params: { joins: ['foo'] },
					fields: { foo: true }
				});
			});

			it('when \'params.joins\' and join definition join key does not match', function() {

				// testing QueryBuilder._validateJoin

				assertThrowsBuildJoins({
					params: { joins: ['foo'] },
					fields: { foo: true },
					joins: { bar: { alias: 'b', on: ['fieldA', 'fieldB'] } }
				});
			});

			it('when join definition is invalid', function() {

				// testing QueryBuilder._validateJoin

				assertThrowsBuildJoins({
					params: { joins: ['joinA', 'joinA', 'joinC', 'joinD'] },
					fields: { foo: true },
					joins: {
						joinA: 'some wrong definition',
						joinB: true,
						joinC: 80,
						joinD: ['foo', 'bar']
					}
				});
			});

			it('when \'alias\' is missing in join definition', function() {

				// testing QueryBuilder._validateJoin

				assertThrowsBuildJoins({
					params: { joins: ['joinA'] },
					fields: { foo: true },
					joins: { joinA: {} }
				});
			});

			it('when \'method\' is missing in join definition', function() {

				// testing QueryBuilder._validateJoin

				assertThrowsBuildJoins({
					params: { joins: ['joinA'] },
					fields: { foo: true },
					joins: { joinA: { alias: 'j' } }
				});
			});

			it('when \'method\' is invalid in join definition', function() {

				// testing QueryBuilder._validateJoin

				assertThrowsBuildJoins({
					params: { joins: ['joinA'] },
					fields: { foo: true },
					joins: { joinA: { alias: 'j', method: 'foo' } }
				});
			});

			it('when \'on\' and \'orOn\' is missing in join definition', function() {

				// testing QueryBuilder._validateJoin

				assertThrowsBuildJoins({
					params: { joins: ['joinA'] },
					fields: { foo: true },
					joins: { joinA: { alias: 'j', method: 'left' } }
				});
			});

			it('when \'on\' and \'orOn\' are invalid in join definition', function() {

				// testing QueryBuilder._validateJoin

				const invalidOns = [
					true,
					123,
					{ foo: 'bar' },
					[],
					[1],
					['foo'],
					['foo', 1],
					['foo', 'bar', 1],
					['foo', 'badOperator', 'bar'],
					[[1], [2]],
					[['foo'], ['bar']],
					[['foo', 'bar'], ['bar']],
					[['foo'], ['foo', 'bar']],
					[['foo', 'bar'], ['foo', 'badOperator', 'bar']],
					[['foo', 'badOperator', 'bar'], ['foo', 'bar']]
				];

				invalidOns.forEach(invalidOn => {

					const params = {
						params: { joins: ['tableA'] },
						fields: { foo: true, bar: true },
						joins: { tableA: { alias: 'j', on: invalidOn } }
					};

					assertThrowsBuildJoins(params);

					delete params.joins.tableA.on;
					params.joins.tableA.orOn = invalidOn;

					assertThrowsBuildJoins(params);
				});
			});
		});

		describe('Should join', function() {

			const assertJoinAndGetFakeKnex = (queryBuilderParams, joinTable, joinMethod) => {

				const queryBuilder = queryBuilderFactory(queryBuilderParams);

				queryBuilder.build();

				assert(queryBuilder.knexStatement[joinMethod].calledOnce);

				assert.equal(queryBuilder.knexStatement[joinMethod].args[0][0], joinTable);

				const joinCallback = queryBuilder.knexStatement[joinMethod].args[0][1];

				assert.equal(typeof joinCallback, 'function');

				const fakeKnex = makeKnex();

				joinCallback(fakeKnex);

				return fakeKnex;
			};

			it('Should call \'join\' knex method when valid join configuration', function() {

				const queryBuilderParams = {
					params: { joins: ['tableB'] },
					fields: { foo: true, bar: { table: 'tableB' } },
					joins: { tableB: { alias: 'j', on: ['foo', 'bar'] } }
				};

				const fakeKnex = assertJoinAndGetFakeKnex(queryBuilderParams, 'tableB as j', 'leftJoin');

				assert.equal(fakeKnex.on.callCount, 1);

				assert.deepEqual(fakeKnex.on.args[0], ['t.foo', 'j.bar']);

				assert.equal(fakeKnex.orOn.callCount, 0);
			});

			it('Should call \'join\' knex method when valid join with multiple \'on\' configuration', function() {

				const queryBuilderParams = {
					params: { joins: ['tableB'] },
					fields: { foo: true, bar: { table: 'tableB' }, foo2: true, bar2: { table: 'tableB' } },
					joins: {
						tableB: {
							method: 'join',
							alias: 'j',
							on: [['foo', 'bar'], ['foo2', 'bar2']]
						}
					}
				};

				const fakeKnex = assertJoinAndGetFakeKnex(queryBuilderParams, 'tableB as j', 'join');

				assert.equal(fakeKnex.on.callCount, 2);

				assert.deepEqual(fakeKnex.on.args[0], ['t.foo', 'j.bar']);
				assert.deepEqual(fakeKnex.on.args[1], ['t.foo2', 'j.bar2']);

				assert.equal(fakeKnex.orOn.callCount, 0);
			});

			it('Should call \'join\' knex method when valid join with multiple \'orOn\' configuration', function() {

				const queryBuilderParams = {
					params: { joins: ['tableB'] },
					fields: {
						foo: true,
						bar: { table: 'tableB' },
						foo2: true,
						bar2: { table: 'tableB' },
						foo3: true,
						bar3: { table: 'tableB' }
					},
					joins: {
						tableB: {
							alias: 'j',
							method: 'fullOuter',
							orOn: [
								['foo', 'bar'],
								['foo2', '=', 'bar2'],
								['foo3', '!=', 'bar3']
							]
						}
					}
				};

				const fakeKnex = assertJoinAndGetFakeKnex(queryBuilderParams, 'tableB as j', 'fullOuterJoin');

				assert.equal(fakeKnex.on.callCount, 0);
				assert.equal(fakeKnex.orOn.callCount, 3);

				assert.deepEqual(fakeKnex.orOn.args[0], ['t.foo', 'j.bar']);
				assert.deepEqual(fakeKnex.orOn.args[1], ['t.foo2', '=', 'j.bar2']);
				assert.deepEqual(fakeKnex.orOn.args[2], ['t.foo3', '!=', 'j.bar3']);
			});
		});
	});

	describe('buildFilters', function() {

		const callWhereCallback = (queryBuilder, whereMethod = 'where', callIndex = 0) => {

			const whereCallback = queryBuilder.knexStatement[whereMethod].args[callIndex][0];

			assert.equal(typeof whereCallback, 'function');

			const fakeKnex = makeKnex();

			whereCallback(fakeKnex);

			return fakeKnex;
		};

		describe('Shouldn\t call knex.where methods', function() {

			it('when no filters passed', function() {

				const queryBuilder = queryBuilderFactory();

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.notCalled);
			});

			it('when filters passed but missed definition', function() {

				const queryBuilder = queryBuilderFactory({
					params: { filters: { id: 1 } }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.notCalled);
			});
		});

		describe('Should throws', function() {

			const assertThrowsWhenBuildAndWhereCallback = queryBuilderParams => {

				const queryBuilder = queryBuilderFactory(queryBuilderParams);

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);
				assert.throws(() => { callWhereCallback(queryBuilder); }, QueryBuilderError);
			};

			it('when non-existent filters passed', function() {
				assertThrowsWhenBuildAndWhereCallback({
					params: { filters: { id: 1 } },
					fields: { foo: 'foo' }
				});
			});

			it('when invalid filter type passed', function() {
				assertThrowsWhenBuildAndWhereCallback({
					params: { filters: { id: { field: 'id', type: 'foo', value: 1 } } },
					fields: { id: 'id' }
				});
			});

			it('when passed a filter that denies multiple values', function() {
				assertThrowsWhenBuildAndWhereCallback({
					params: { filters: { id: { field: 'id', type: 'greater', value: [1, 2, 3] } } },
					fields: { id: 'id' }
				});
			});

			it('when passed a filter that needs multiple values', function() {
				assertThrowsWhenBuildAndWhereCallback({
					params: { filters: { id: { field: 'id', type: 'between', value: 1 } } },
					fields: { id: 'id' }
				});
			});

			it('when passed a filter that needs specific quantity of multiple values', function() {

				assertThrowsWhenBuildAndWhereCallback({
					params: { filters: { id: { field: 'id', type: 'between', value: [1, 2, 3] } } },
					fields: { id: 'id' }
				});
			});
		});

		describe('Should call knex.where methods', function() {

			it('Should call \'where\' knex method when filter passed', function() {

				const params = { filters: { id: 1 } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', 1]);
			});

			it('Should call \'whereIn\' knex method when filter with multiple values passed', function() {

				const params = { filters: { id: { value: [1, 2] } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereIn.callCount, 1);
				assert.deepEqual(fakeKnex.whereIn.args[0], ['t.id', [1, 2]]);
			});

			it('Should call \'orWhere\' knex method once when filter as array are passed', function() {

				const params = { filters: [{ id: 1 }] };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.orWhere.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder, 'orWhere');

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', 1]);
			});

			it('Should call \'orWhere\' knex method twice when 2 filter in an array are passed', function() {

				const params = {
					filters: [{ id: 1 }, { id: 3 }]
				};
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.orWhere.calledTwice);

				const fakeKnex = callWhereCallback(queryBuilder, 'orWhere');

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', 1]);

				const fakeKnex2 = callWhereCallback(queryBuilder, 'orWhere', 1);

				assert.equal(fakeKnex2.where.callCount, 1);
				assert.deepEqual(fakeKnex2.where.args[0], ['t.id', 3]);
			});

			it('Should call \'whereNot\' knex method when \'notEqual\' filter passed', function() {

				const params = { filters: { id: { value: 98, type: 'notEqual' } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereNot.callCount, 1);
				assert.deepEqual(fakeKnex.whereNot.args[0], ['t.id', 98]);
			});

			it('Should call \'whereNotIn\' knex method when \'notEqual\' filter with multiple values passed', function() {

				const params = { filters: { id: { value: [1, 2], type: 'notEqual' } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereNotIn.callCount, 1);
				assert.deepEqual(fakeKnex.whereNotIn.args[0], ['t.id', [1, 2]]);
			});

			it('Should call \'where\' knex method with \'>\' when \'greater\' filter passed', function() {

				const params = { filters: { id: { value: 1, type: 'greater' } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', '>', 1]);
			});

			it('Should call \'where\' knex method with \'>=\' when \'greaterOrEqual\' filter passed', function() {

				const params = { filters: { id: { value: 1, type: 'greaterOrEqual' } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', '>=', 1]);
			});

			it('Should call \'where\' knex method with \'<\' when \'lesser\' filter passed', function() {

				const params = { filters: { id: { value: 1, type: 'lesser' } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', '<', 1]);
			});

			it('Should call \'where\' knex method with \'<=\' when \'lesserOrEqual\' filter passed', function() {

				const params = { filters: { id: { value: 1, type: 'lesserOrEqual' } } };
				const fields = { id: 'id' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.id', '<=', 1]);
			});

			it('Should call \'where\' knex method with \'LIKE\' when \'search\' filter passed', function() {

				const params = { filters: { foo: { value: 'foo', type: 'search' } } };
				const fields = { foo: 'foo' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.foo', 'LIKE', '%foo%']);
			});

			it('Should call \'whereBetween\' knex method when \'between\' filter passed', function() {

				const params = { filters: { foo: { value: ['hey', 'there'], type: 'between' } } };
				const fields = { foo: 'foo' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereBetween.callCount, 1);
				assert.deepEqual(fakeKnex.whereBetween.args[0], ['t.foo', ['hey', 'there']]);
			});

			it('Should call \'whereNotBetween\' knex method when \'notBetween\' filter passed', function() {

				const params = { filters: { foo: { value: ['hey', 'there'], type: 'notBetween' } } };
				const fields = { foo: 'foo' };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereNotBetween.callCount, 1);
				assert.deepEqual(fakeKnex.whereNotBetween.args[0], ['t.foo', ['hey', 'there']]);
			});

			it('Should call \'whereNull\' knex method with \'t.foo\' when null type filter passed', function() {

				const params = { filters: { foo: { type: 'null' } } };
				const fields = { foo: true };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereNull.callCount, 1);
				assert.deepEqual(fakeKnex.whereNull.args[0], ['t.foo']);
			});

			it('Should call \'whereNotNull\' knex method with \'t.foo\' when notNull type filter passed', function() {

				const params = { filters: { foo: { type: 'notNull' } } };
				const fields = { foo: true };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereNotNull.callCount, 1);
				assert.deepEqual(fakeKnex.whereNotNull.args[0], ['t.foo']);
			});

			it('Should call \'where\' knex method with \'LIKE\' when \'search\' in fields definition', function() {

				const params = { filters: { foo: { value: 'foo' } } };
				const fields = { foo: { type: 'search' } };

				const queryBuilder = queryBuilderFactory({ params, fields });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.where.callCount, 1);
				assert.deepEqual(fakeKnex.where.args[0], ['t.foo', 'LIKE', '%foo%']);
			});

			it('Should call \'whereRaw\' knex method for flags filters', function() {

				const queryBuilder = queryBuilderFactory({
					fields: {
						status: true,
						isActive: true,
						error: true
					},
					flags: {
						status: { isActive: 1, error: 2 }
					},
					params: {
						filters: { isActive: true, error: false }
					}
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.where.calledOnce);

				const fakeKnex = callWhereCallback(queryBuilder);

				assert.equal(fakeKnex.whereRaw.callCount, 2);
				assert.deepEqual(fakeKnex.whereRaw.args[0], ['(t.status & 1) = ?', '1']);
				assert.deepEqual(fakeKnex.whereRaw.args[1], ['(t.status & 2) = ?', '0']);

			});

		});
	});

	describe('buildOrder', function() {

		describe('Shouldn\'t call knex.orderBy', function() {

			it('when params.order not passed', function() {

				const queryBuilder = queryBuilderFactory();
				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.orderBy.called, false);

			});

			it('when params.order passed but no fields', function() {

				// order passed but no fields

				const queryBuilder = queryBuilderFactory({
					params: { order: 'id' }
				});
				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.orderBy.called, false);
			});
		});

		describe('Should throws', function() {

			it('when format invalid order passed', function() {

				assertThrowsWhenBuild(queryBuilderFactory({
					fields: { id: true },
					params: { order: ['id'] }
				}));
			});

			it('when invalid direction in order passed', function() {

				assertThrowsWhenBuild(queryBuilderFactory({
					fields: { id: true },
					params: { order: { id: 'foo' } }
				}));
			});

			it('when field not present in definition', function() {

				assertThrowsWhenBuild(queryBuilderFactory({
					fields: { foo: true },
					params: { order: 'bar' }
				}));
			});
		});

		describe('Should call knex.orderBy', function() {

			it('when simple \'params.order\' passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: 'id' },
					params: { order: 'id' }
				});

				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.orderBy.called, true);
				assert.equal(queryBuilder.knexStatement.orderBy.calledOnce, true);

				assert.deepEqual(queryBuilder.knexStatement.orderBy.args[0], ['t.id', 'asc']);
			});

			it('when complex \'params.order\' passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: 'id' },
					params: { order: { id: 'desc' } }
				});

				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.orderBy.calledOnce, true);

				assert.deepEqual(queryBuilder.knexStatement.orderBy.args[0], ['t.id', 'desc']);
			});

			it('when multiple \'params.order\' passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { id: 'id', name: 'name', date: 'date' },
					params: { order: { name: 'desc', id: 'asc' } }
				});

				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.orderBy.calledTwice, true);

				assert.deepEqual(queryBuilder.knexStatement.orderBy.args[0], ['t.name', 'desc']);
				assert.deepEqual(queryBuilder.knexStatement.orderBy.args[1], ['t.id', 'asc']);
			});
		});

		describe('Should call knex.orderByRaw', function() {
			it('when flag field in \'params.order\' passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: {
						status: true,
						isActive: true
					},
					flags: { status: { isActive: 1 } },
					params: { order: 'isActive' }
				});

				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.orderByRaw.calledOnce, true);

				assert.deepEqual(queryBuilder.knexStatement.orderByRaw.args[0], ['(t.status & 1) asc']);
			});
		});
	});

	describe('buildLimit - Limit', function() {

		describe('Shouldn\'t call knex.limit', function() {

			it('when \'params.limit\' not passed', function() {

				const queryBuilder = queryBuilderFactory();

				queryBuilder.build();

				assert(queryBuilder.knexStatement.limit.notCalled);
			});
		});

		describe('Should throws', function() {

			it('when invalid \'params.limit\' passed', function() {

				const invalidLimits = [
					'foo',
					['foo', 'bar'],
					{ foo: 'bar' }
				];

				invalidLimits.forEach(invalidLimit => assertThrowsWhenBuild(queryBuilderFactory({ params: { limit: invalidLimit } })));
			});
		});

		describe('Should call knex.limit', function() {

			it('when valid \'params.limit\' passed', function() {

				const queryBuilder = queryBuilderFactory({ params: { limit: 1 } });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.limit.calledOnce);
				assert.deepEqual(queryBuilder.knexStatement.limit.args[0], [1]);
			});

			it('when valid \'params.limit\' and \'param.page\' passed', function() {

				const queryBuilder = queryBuilderFactory({ params: { limit: 5, page: 1 } });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.limit.calledOnce);
				assert.deepEqual(queryBuilder.knexStatement.limit.args[0], [5]);
			});
		});
	});

	describe('buildGroup', function() {

		describe('Shouldn\'t call knex.groupBy', function() {

			it('when \'params.group\' not passed', function() {

				const queryBuilder = queryBuilderFactory();

				queryBuilder.build();

				assert(queryBuilder.knexStatement.groupBy.notCalled);
			});

			it('when \'params.group\' as false passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true },
					params: { group: false }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.groupBy.notCalled);
			});

			it('when \'params.group\' passed but missed fields definition', function() {

				const queryBuilder = queryBuilderFactory({
					params: { group: { foo: 'bar' } }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.groupBy.notCalled);
			});
		});

		describe('Should throws', function() {

			it('when invalid \'params.group\' passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true },
					params: { group: { foo: 'bar' } }
				});

				assertThrowsWhenBuild(queryBuilder);
			});

			it('when valid \'params.group\' passed but unknown field', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true },
					params: { group: 'bar' }
				});

				assertThrowsWhenBuild(queryBuilder);
			});

			it('when valid \'params.group\' passed but unknown field in an array', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true },
					params: { group: ['bar'] }
				});

				assertThrowsWhenBuild(queryBuilder);
			});

			it('when \'params.group\' as an empty array', function() {

				const queryBuilder = queryBuilderFactory({ params: { group: [] }, fields: { foo: true } });

				assertThrowsWhenBuild(queryBuilder);

				assert(queryBuilder.knexStatement.groupBy.notCalled);
			});

		});

		describe('Should call knex.groupBy', function() {

			it('when valid \'params.group\' field passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true },
					params: { group: 'foo' }
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.groupBy.calledOnce);
				assert.deepEqual(queryBuilder.knexStatement.groupBy.args[0], ['t.foo']);
			});

			it('when valid \'params.group\' array of fields passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: { foo: true, bar: true },
					params: { group: ['foo', 'foo', 'bar'] } // arrayUnique for avoid repetition
				});

				queryBuilder.build();

				assert(queryBuilder.knexStatement.groupBy.calledTwice);
				assert.deepEqual(queryBuilder.knexStatement.groupBy.args[0], ['t.foo']);
				assert.deepEqual(queryBuilder.knexStatement.groupBy.args[1], ['t.bar']);
			});

		});

		describe('Should call knex.groupByRaw', function() {

			it('when \'params.group\' with a flag field passed', function() {

				const queryBuilder = queryBuilderFactory({
					fields: {
						status: true,
						isActive: { field: 'status', flag: 1 }
					},
					flags: { status: { isActive: 1 } },
					params: { group: 'isActive' }
				});

				queryBuilder.build();

				assert.equal(queryBuilder.knexStatement.groupByRaw.calledOnce, true);

				assert.deepEqual(queryBuilder.knexStatement.groupByRaw.args[0], ['(t.status & 1)']);
			});
		});
	});

	describe('buildLimit - Offset and Page', function() {

		describe('Shouldn\'t call knex.offset', function() {

			it('when \'params.offset\' not passed', function() {

				const queryBuilder = queryBuilderFactory();

				queryBuilder.build();

				assert(queryBuilder.knexStatement.offset.notCalled);
			});
		});

		describe('Should throws', function() {

			it('when invalid \'params.offset\' passed', function() {

				const invalidOffsets = [
					'foo',
					['foo', 'bar'],
					{ foo: 'bar' }
				];

				invalidOffsets.forEach(invalidOffset => assertThrowsWhenBuild(queryBuilderFactory({ params: { offset: invalidOffset } })));
			});

			it('when invalid \'params.page\' passed', function() {

				const invalidPages = [
					'foo',
					true,
					['foo', 'bar'],
					{ foo: 'bar' }
				];

				invalidPages.forEach(invalidPage => assertThrowsWhenBuild(queryBuilderFactory({ params: { page: invalidPage } })));
			});

			it('when valid \'params.page\' but no \'params.limit\' passed', function() {
				assertThrowsWhenBuild(queryBuilderFactory({ params: { page: 1 } }));
			});
		});

		describe('Should call knex.offset', function() {

			it('when \'params.offset\' passed', function() {

				const queryBuilder = queryBuilderFactory({ params: { offset: 3 } });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.offset.calledOnce);

				assert.deepEqual(queryBuilder.knexStatement.offset.args[0], [3]);
			});

			it('when \'param.limit\' and \'param.page\' passed', function() {

				const queryBuilder = queryBuilderFactory({ params: { limit: 5, page: 3 } });

				queryBuilder.build();

				assert(queryBuilder.knexStatement.limit.calledOnce
					&& queryBuilder.knexStatement.offset.calledOnce);

				assert.deepEqual(queryBuilder.knexStatement.limit.args[0], [5]);
				assert.deepEqual(queryBuilder.knexStatement.offset.args[0], [10]);

			});
		});
	});

	describe('flags', function() {

		it('Should throws - when wrong flag reference field', function() {

			const queryBuilder = queryBuilderFactory({
				params: {
					fields: ['isActive']
				},
				fields: {
					isActive: true
					// status missing
				},
				flags: {
					status: { isActive: 1 }
				}
			});

			assertThrowsWhenBuild(queryBuilder);

			assert(!queryBuilder.knexStatement.select.called);
		});

		it('Should\'t use flag', function() {

			const queryBuilder = queryBuilderFactory({
				params: {
					fields: ['status']
				},
				fields: {
					status: true,
					isActive: true
				},
				flags: {
					status: { isActive: 1 }
				}
			});

			queryBuilder.build();

			assert(queryBuilder.knexStatement.select.calledOnce);
		});
	});

	describe('execute', function() {

		it('Should return knexStatement', function() {

			const queryBuilder = queryBuilderFactory();

			queryBuilder.build();

			const executeSpy = sinon.spy(queryBuilder, 'execute');

			queryBuilder.execute();

			assert(executeSpy.returnValues[0] instanceof Promise);
		});
	});
});
