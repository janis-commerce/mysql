'use strict';

const logger = require('@janiscommerce/logger');

const Utils = require('./../utils');

const QueryBuilderError = require('./query-builder-error');

const JOIN_DEFAULT_METHOD = 'left';
const JOIN_DEFAULT_OPERATOR = '=';

class QueryBuilder {

	static get filterTypes() {
		return {
			equal: { multipleValues: true, multipleMethod: 'whereIn' }, // default
			notEqual: { multipleValues: true, method: 'whereNot', multipleMethod: 'whereNotIn' },
			flagEqual: { method: 'whereRaw' },
			greater: { operator: '>' },
			greaterOrEqual: { operator: '>=' },
			lesser: { operator: '<' },
			lesserOrEqual: { operator: '<=' },
			search: { operator: 'LIKE', valuePrefix: '%', valueSuffix: '%' },
			between: { multipleValues: true, multipleMethod: 'whereBetween', needMultipleValues: 2 },
			notBetween: { multipleValues: true, multipleMethod: 'whereNotBetween', needMultipleValues: 2 },
			null: { method: 'whereNull', noValueNeeded: true },
			notNull: { method: 'whereNotNull', noValueNeeded: true }
		};
	}

	static get selectFunctions() {
		return {
			count: 'count',
			min: 'min',
			max: 'max',
			sum: 'sum',
			avg: 'avg'
		};
	}

	static get joinMethods() {
		return {
			join: 'join',
			inner: 'innerJoin',
			left: 'leftJoin', // default
			leftOuter: 'leftOuter',
			right: 'rightJoin',
			rightOuter: 'rightOuterJoin',
			fullOuter: 'fullOuterJoin',
			cross: 'crossJoin'
		};
	}

	static get joinOperators() {
		return ['=', '!='];
	}

	constructor(knex, model, params) {

		this.knex = knex;
		this.model = model;

		this.modelName = model.constructor.name;

		this.table = model.constructor.table;
		this.fields = model.constructor.fields;
		this.flags = model.constructor.flags;
		this.joins = model.constructor.joins;

		this.params = params;
	}

	/**
	 * Build query parameters
	 *
	 */
	build() {

		this._init();

		this._buildSelect();

		if(this._modelHasFieldsStructure()) {
			this._buildJoins();
			this._buildFilters();
			this._buildOrder();
			this._buildGroup();
		} else
			logger.warn('QueryBuilder - No fields structure');

		this._buildLimit();

		if(this.params.debug)
			logger.info('statement', this.knexStatement.toString());
	}

	/**
	 * Initializes the Query Builder, creates the Knex Statement with table
	 *
	 */
	_init() {

		const { table = this.table } = this.params;

		this.knexStatement = this.knex({ t: this.model.addDbName(table) });
		this.knexStatement.raw = this.knex.raw;
	}

	/**
	 * Indicates if Model has fields structure
	 *
	 * @return {boolean} true if has structure, false otherwise
	 */
	_modelHasFieldsStructure() {
		return this.fields && Object.keys(this.fields).length > 0;
	}

	/**
	 * Build Select. Call Knex Select with fields in params
	 *
	 */
	_buildSelect() {

		const { fields } = this.params;

		let fieldsForSelect;
		let flagFieldsForSelect = false;

		if(typeof fields === 'undefined') {
			fieldsForSelect = 't.*';

			if(typeof this.params.noFlags === 'undefined' || !this.params.noFlags)
				flagFieldsForSelect = this._getFlagFieldsForSelect(this._getFlagFields());

		} else if(fields === false)
			fieldsForSelect = false;
		else if(Array.isArray(fields)) {

			this._validateFields(fields);

			fieldsForSelect = this._getFieldsForSelect(fields);

			flagFieldsForSelect = this._getFlagFieldsForSelect(fields);

		} else
			throw new QueryBuilderError('Param \'fields\' must be an array');

		let nothingToSelect = true;

		if(fieldsForSelect) {
			this.knexStatement.select(fieldsForSelect);
			nothingToSelect = false;
		}

		if(flagFieldsForSelect) {
			flagFieldsForSelect = Object.values(flagFieldsForSelect).join(', ');
			this.knexStatement.select(this.knexStatement.raw(flagFieldsForSelect));
			nothingToSelect = false;
		}

		const selectFunctions = this._getSelectFunctions();

		for(const selectFunction of selectFunctions) {
			this.knexStatement[selectFunction.method](selectFunction.select);
			nothingToSelect = false;
		}

		if(nothingToSelect)
			throw new QueryBuilderError('Nothing to select');
	}

	/**
	 * Validate fields
	 *
	 * @param {array} fields The fields
	 * @return {boolean} true if valid, throw otherwise
	 */
	_validateFields(fields) {

		fields.forEach(field => {
			if(!this._validateField(field))
				throw this.error;
		});

		return true;
	}

	/**
	 * Validates a field
	 *
	 * @param {string} fieldName The field name
	 * @return {boolean} true if valid, false otherwise
	 */
	_validateField(fieldName) {

		if(!this._fieldExists(fieldName)) {
			this.error = new QueryBuilderError(`Unknown field '${fieldName}', check ${this.modelName}.fields`);
			return false;
		}

		return true;
	}

	/**
	 * Check if field exists
	 *
	 * @param {string} fieldName The field name
	 * @return {Boolean} true if exists, false otherwise
	 */
	_fieldExists(fieldName) {
		return typeof this.fields[fieldName] !== 'undefined';
	}

	/**
	 * Gets the flag fields for the actual model.
	 *
	 * @return {Array} The flag fields.
	 */
	_getFlagFields() {

		if(typeof this.flags === 'undefined')
			return [];

		let flagFields = [];

		for(const flags of Object.values(this.flags))
			flagFields = [...flagFields, ...Object.keys(flags)];

		return flagFields;
	}

	/**
	 * Filter and format fields for Select purpose
	 *
	 * @param {array} fields The fields
	 * @return {object|false} The fields for select, or false if empty
	 */
	_getFieldsForSelect(fields) {

		const fieldsForSelect = {};

		fields.forEach(fieldName => {

			if(this._isFlagField(fieldName))
				return;

			fieldsForSelect[this._getAliasForSelect(fieldName)] = this._getFormattedField(fieldName);
		});

		return Object.keys(fieldsForSelect).length ? fieldsForSelect : false;
	}

	/**
	 * Determines if the flag is a 'flag field'.
	 *
	 * @param {string} fieldName The field name
	 * @return {boolean} True if flag field, False otherwise.
	 */
	_isFlagField(fieldName) {

		const flagData = this._getFlagData(fieldName);

		return flagData !== false;
	}


	/**
	 * Gets the flag data.
	 *
	 * @param {string} fieldName The field name
	 * @return {(Object|false)} The flag data or false if not a flag.
	 */
	_getFlagData(fieldName) {

		if(typeof this.flags === 'undefined')
			return false;

		for(const [field, flags] of Object.entries(this.flags)) {
			for(const [flag, flagValue] of Object.entries(flags)) {
				if(fieldName !== flag)
					continue;

				if(!this._validateField(field))
					throw new QueryBuilderError(this.error);

				return { field, value: flagValue };
			}
		}

		return false;
	}

	/**
	 * Gets the alias for select.
	 *
	 * @param {string} fieldName The field name
	 * @return {string} The alias for select.
	 */
	_getAliasForSelect(fieldName) {
		return typeof this.fields[fieldName] === 'object' && this.fields[fieldName].alias ? this.fields[fieldName].alias : fieldName;
	}

	/**
	 * Gets the field correct string to select, filter or order
	 *
	 * @param {string} fieldName The field name
	 * @return {string} The formatted field.
	 */
	_getFormattedField(fieldName) {

		if(this._isFlagField(fieldName))
			return this._getFormattedFlagField(fieldName);

		return `${this._getTableAliasFromField(fieldName)}.${this._getRealFieldName(fieldName)}`;
	}

	/**
	 * Gets the table alias for field.
	 *
	 * @param {string} fieldName The field name
	 * @return {string} The table alias.
	 */
	_getTableAliasFromField(fieldName) {

		if(typeof this.fields[fieldName] !== 'object')
			return 't';

		const field = this.fields[fieldName];

		if(field.table && this.joins && this.joins[field.table] && this.joins[field.table].alias)
			return this.joins[field.table].alias;

		return 't';
	}

	/**
	 * Gets the real field name.
	 *
	 * @param {string} fieldName The field name
	 * @return {string} The real field name.
	 */
	_getRealFieldName(fieldName) {

		const field = this.fields[fieldName];

		if(typeof field === 'boolean')
			return fieldName;

		if(typeof field === 'string')
			return field;

		if(typeof field === 'object' && field.field && typeof field.field === 'string')
			return field.field;

		return fieldName;
	}

	_getFlagFieldsForSelect(fields) {

		const flagFieldsForSelect = {};

		fields.forEach(fieldName => {

			if(!this._isFlagField(fieldName))
				return;

			const { value } = this._getFlagData(fieldName);

			flagFieldsForSelect[fieldName] = `(${this._getFormattedFlagField(fieldName)} = ${value}) as ${fieldName}`;
		});

		return Object.keys(flagFieldsForSelect).length ? flagFieldsForSelect : false;
	}

	_getFormattedFlagField(fieldName) {

		const { field, value } = this._getFlagData(fieldName);

		return `(${this._getTableAliasFromField(field)}.${this._getRealFieldName(field)} & ${value})`;
	}

	/**
	 * Gets the select functions.
	 *
	 * @return {(Object|boolean)} The select functions.
	 */
	_getSelectFunctions() {

		const selectFunctions = [];

		for(const [selectFunction, selectMethod] of Object.entries(this.constructor.selectFunctions)) {

			if(!this.params[selectFunction])
				continue;

			const data = this.params[selectFunction];

			if(Array.isArray(data))
				throw new QueryBuilderError(`Param '${selectFunction}' can't be an array`);

			let field = '*';
			let alias = selectFunction;

			if(data === true)
				field = '*';
			else if(typeof data === 'string')
				field = data;
			else if(typeof data === 'object') {

				if(data.field)
					({ field } = data);

				if(data.alias)
					({ alias } = data);
			} else
				throw new QueryBuilderError(`Param '${selectFunction}' invalid format`);

			if(field !== '*') {
				if(!this._validateField(field))
					throw this.error;

				field = this._getFormattedField(field);
			}

			selectFunctions.push({
				method: selectMethod,
				select: `${field} as ${alias}`
			});
		}

		return selectFunctions;
	}

	/**
	 * Build Joins.
	 */
	_buildJoins() {

		const { joins } = this.params;

		if(!joins)
			return;

		if(!Array.isArray(joins))
			throw new QueryBuilderError('Param \'joins\' must be an array');

		joins.forEach(joinKey => this._makeJoin(joinKey));
	}

	/**
	 * Add a single join.
	 *
	 * @param {string} joinKey The join key
	 */
	_makeJoin(joinKey) {

		if(!this._validateJoin(joinKey))
			throw this.error;

		const joinTable = this._getJoinTable(joinKey);
		const joinMethod = this._getJoinMethod(joinKey);

		this.knexStatement[joinMethod](joinTable, builder => {

			const modelJoin = this.joins[joinKey];

			if(modelJoin.multipleOn) {

				const onMethod = modelJoin.on ? 'on' : 'orOn';

				modelJoin[onMethod].forEach(onItem => {
					const joinFields = this._getFormattedJoinFields(onItem);
					builder[onMethod](...joinFields);
				});
			} else {
				const joinFields = this._getFormattedJoinFields(modelJoin.on);
				builder.on(...joinFields);
			}
		});
	}


	/**
	 * Validates the join structure
	 *
	 * @param {string} joinKey The join key
	 * @return {boolean} true if valid, false otherwise
	 */
	_validateJoin(joinKey) {

		if(!this._joinExists(joinKey)) {
			this.error = new QueryBuilderError(`Unknown joinKey '${joinKey}', check ${this.modelName}.joins`);
			return false;
		}

		const modelJoin = this.joins[joinKey];

		if(typeof modelJoin !== 'object') {
			this.error = new QueryBuilderError(`join '${joinKey}' must be an object, check ${this.modelName}.joins.${joinKey}`);
			return false;
		}

		if(!modelJoin.alias) {
			this.error = new QueryBuilderError(`join '${joinKey}' 'alias' is required, check ${this.modelName}.joins.${joinKey}`);
			return false;
		}

		if(modelJoin.method && !this._joinMethodExists(modelJoin.method)) {
			this.error = new QueryBuilderError(`invalid join method '${modelJoin.method}', check QueryBuilder.joinMethods`);
			return false;
		}

		if(!modelJoin.on && !modelJoin.orOn) {
			this.error = new QueryBuilderError(`join '${joinKey}' 'on' or 'orOn' are required, check ${this.modelName}.joins.${joinKey}`);
			return false;
		}

		if(modelJoin.on)
			return this._validateJoinOn(joinKey);

		return this._validateJoinOn(joinKey, 'orOn');
	}

	/**
	 * Indicates if join exists
	 *
	 * @param {string} joinKey The join key
	 * @return {Boolean} true if exists, false otherwise
	 */
	_joinExists(joinKey) {
		return typeof this.joins[joinKey] !== 'undefined';
	}

	/**
	 * Indicates if join method exists
	 *
	 * @param {string} joinMethod The join method
	 * @return {Boolean} true if exists, false otherwise
	 */
	_joinMethodExists(joinMethod) {
		return typeof this.constructor.joinMethods[joinMethod] !== 'undefined';
	}

	/**
	 * Indicates if operator is valid
	 *
	 * @param {string} operator The join operator
	 * @return {boolear} true if valid operator, false otherwise
	 */
	_validateJoinOperator(operator) {

		if(!this.constructor.joinOperators.includes(operator)) {
			this.error = new QueryBuilderError(`Unknown join operator '${operator}'`);
			return false;
		}

		return true;
	}

	/**
	 * Validates Joins 'on' part
	 *
	 * @param {string} joinKey The join key
	 * @param {string} type The type
	 * @return {boolean} true if valid, false otherwise
	 */
	_validateJoinOn(joinKey, type = 'on') {

		const on = this.joins[joinKey][type];

		if(!Array.isArray(on)) {
			this.error = new QueryBuilderError(`join '${joinKey}' parts 'on' and 'orOn' must be an array, check ${this.modelName}.joins.${joinKey}`);
			return false;
		}

		if(!on.length) {
			/* eslint-disable max-len */
			this.error = new QueryBuilderError(`join '${joinKey}' parts 'on' and 'orOn' must be an array with content, check ${this.modelName}.joins.${joinKey}`);
			return false;
		}

		if(on.every(joinField => typeof joinField === 'string'))
			return this._validateJoinFields(joinKey, on);

		if(on.every(joinFields => Array.isArray(joinFields))) {
			this.joins[joinKey].multipleOn = true;
			return on.every(joinFields => this._validateJoinFields(joinKey, joinFields));
		}

		/* eslint-disable max-len */
		this.error = new QueryBuilderError(`join '${joinKey}' parts 'on' and 'orOn' must be an arrays or strings, check ${this.modelName}.joins.${joinKey}`);
		return false;
	}

	/**
	 * Validates Joins 'fields' part
	 *
	 * @param {string} joinKey The join key
	 * @param {array} joinFields the join fields
	 * @return {boolean} true if valid fields, false otherwise
	 */
	_validateJoinFields(joinKey, joinFields) {

		if(joinFields.length !== 2 && joinFields.length !== 3) {
			this.error = new QueryBuilderError(`join '${joinKey}' parts 'on' and 'orOn' must have 2 o 3 values, check ${this.modelName}.joins.${joinKey}`);
			return false;
		}

		let operator = JOIN_DEFAULT_OPERATOR;
		let fieldA;
		let fieldB;

		if(joinFields.length === 2)
			[fieldA, fieldB] = joinFields;
		else
			[fieldA, operator, fieldB] = joinFields;

		return this._validateField(fieldA)
			&& !this._isFlagField(fieldA)
			&& this._validateJoinOperator(operator)
			&& this._validateField(fieldB)
			&& !this._isFlagField(fieldB);
	}

	/**
	 * Gets the join method.
	 *
	 * @param {string} joinKey The join key
	 * @return {string} The join method.
	 */
	_getJoinMethod(joinKey) {
		const joinMethod = this.joins[joinKey].method || JOIN_DEFAULT_METHOD;
		return this.constructor.joinMethods[joinMethod];
	}

	/**
	 * Gets the join table.
	 *
	 * @param {string} joinKey The join key
	 * @return {string} The join table.
	 */
	_getJoinTable(joinKey) {
		const modelJoin = this.joins[joinKey];
		const table = modelJoin.table || joinKey;
		return `${this.model.addDbName(table)} as ${modelJoin.alias}`;
	}

	/**
	 * Gets the formatted join fields.
	 *
	 * @param {array} joinFields The join fields
	 * @return {array} The formatted join fields.
	 */
	_getFormattedJoinFields(joinFields) {
		return joinFields.map(joinField => {
			return this._fieldExists(joinField) ? this._getFormattedField(joinField) : joinField;
		});
	}

	/**
	 * Builds filters. Add AND or OR filters.
	 */
	_buildFilters() {

		const { filters } = this.params;

		if(!filters)
			return;

		if(Array.isArray(filters))
			filters.forEach(filterItems => this._addOrFilters(filterItems));
		else
			this._addAndFilters(filters);
	}

	/**
	 * Adds OR filters. Calling Knex orWhere method
	 *
	 * @param {object} filters The filters
	 */
	_addOrFilters(filters) {
		this.knexStatement.orWhere(builder => this._makeFilters(builder, filters));
	}

	/**
	 * Adds AND filters. Calling Knex where method
	 *
	 * @param {object} filters The filters
	 */
	_addAndFilters(filters) {
		this.knexStatement.where(builder => this._makeFilters(builder, filters));
	}

	/**
	 * Makes filters. Calling Knex where methods
	 *
	 * @param {function} builder The Knex builder callback
	 * @param {object} filters The filters
	 */
	_makeFilters(builder, filters) {

		for(const [fieldName, filter] of Object.entries(filters)) {

			if(!this._validateFilter(fieldName, filter))
				throw this.error;

			const filterMethod = this._getFilterMethod(fieldName, filter);

			const filterParams = this._getFilterParams(fieldName, filter);

			builder[filterMethod](...filterParams);
		}
	}

	/**
	 * Check if filter is valid
	 *
	 * @param {string} fieldName The field name
	 * @param {mixed} filter The filter content, value or object with definition
	 * @return {boolean} True if filter is valid, false otherwise
	 */
	_validateFilter(fieldName, filter) {

		if(!this._validateField(fieldName))
			return false;

		const filterType = this._getFilterType(fieldName, filter);

		if(!this._filterTypeExists(filterType)) {
			this.error = new QueryBuilderError(`Unknown filter type '${filterType}' for filter '${fieldName}'`);
			return false;
		}

		const isMultiple = this._filterIsMultiple(fieldName, filter);

		if(isMultiple && !this._filterTypeAllowsMultipleValues(filterType)) {
			this.error = new QueryBuilderError(`Filter type '${filterType}' not allows multiple values for filter '${fieldName}'`);
			return false;
		}

		const { needMultipleValues } = this.constructor.filterTypes[filterType];

		if(needMultipleValues) {

			// needMultipleValues es la cantidad de valores que "necesita" para filtrar

			if(!isMultiple) {
				this.error = new QueryBuilderError(`Filter type '${filterType}' needs multiple values for filter '${fieldName}'`);
				return false;
			}

			const filterValue = this._getFilterValue(fieldName, filter);

			if(filterValue.length !== needMultipleValues) {
				this.error = new QueryBuilderError(`Filter type '${filterType}' must an array with 2 values for filter '${fieldName}'`);
				return false;
			}
		}

		return true;
	}

	/**
	 * Gets the filter type.
	 *
	 * @param {string} fieldName The field name
	 * @param {object} filter The filter data
	 * @return {string} The filter type.
	 */
	_getFilterType(fieldName, filter) {

		if(this._isFlagField(fieldName))
			return 'flagEqual';

		if(typeof filter === 'object' && filter.type)
			return filter.type;

		if(typeof this.fields[fieldName] === 'object' && this.fields[fieldName].type)
			return this.fields[fieldName].type;

		return 'equal';
	}

	/**
	 * Check if filter type exists
	 *
	 * @param {string} filterType The filter type
	 * @return {boolean} True if filter exists, false otherwise
	 */
	_filterTypeExists(filterType) {
		return filterType && typeof filterType === 'string' && this.constructor.filterTypes[filterType];
	}

	/**
	 * Check if filter value is multiple
	 *
	 * @param {string} fieldName The field name
	 * @param {mixed} filter The filter content or value
	 * @return {boolean} true if is multiple, false otherwise
	 */
	_filterIsMultiple(fieldName, filter) {
		return Array.isArray(this._getFilterValue(fieldName, filter));
	}

	/**
	 * Gets the filter value.
	 *
	 * @param {string} fieldName The field name
	 * @param {mixed} filter The filter content or value
	 * @return {mixed} The filter value.
	 */
	_getFilterValue(fieldName, filter) {

		let value = filter.value || filter;

		if(this._isFlagField(fieldName))
			value = value ? this._getFlagData(fieldName).value : 0;

		return value;
	}

	/**
	 * Prepares filter value
	 *
	 * @param {string} fieldName The field name
	 * @param {mixed} filter The filter content or value
	 * @return {mixed} filter value
	 */
	_prepareFilterValue(fieldName, filter) {

		const filterType = this._getFilterType(fieldName, filter);
		const valuePrefix = this._getFilterValuePrefix(filterType);
		const valueSuffix = this._getFilterValueSuffix(filterType);

		const addPrefixAndSuffix = value => {
			if(valuePrefix)
				value = `${valuePrefix}${value}`;

			if(valueSuffix)
				value = `${value}${valueSuffix}`;

			return value;
		};

		const filterValue = this._getFilterValue(fieldName, filter);

		return this._filterIsMultiple(fieldName, filter) ? filterValue.map(addPrefixAndSuffix) : addPrefixAndSuffix(filterValue);
	}

	/**
	 * Check if filter allows multiple values
	 *
	 * @param {string} filterType The filter type
	 * @return {boolean} True if filter allows multiple values, false otherwise
	 */
	_filterTypeAllowsMultipleValues(filterType) {
		return this._filterTypeExists(filterType) && this.constructor.filterTypes[filterType].multipleValues;
	}

	/**
	 * Check if should add filter value from filter type
	 *
	 * @param {string} filterType The filter type
	 * @return {boolean} True if should add filter value, false otherwise
	 */
	_filterNeedsValue(filterType) {
		return this._filterTypeExists(filterType) && !this.constructor.filterTypes[filterType].noValueNeeded;
	}

	/**
	 * Gets the filter value prefix.
	 *
	 * @param {string} filterType The filter type
	 * @return {string|boolean} The filter value prefix if any, false otherwise
	 */
	_getFilterValuePrefix(filterType) {
		return this._filterTypeExists(filterType) && this.constructor.filterTypes[filterType].valuePrefix ? this.constructor.filterTypes[filterType].valuePrefix : false;
	}

	/**
	 * Gets the filter value suffix.
	 *
	 * @param {string} filterType The filter type
	 * @return {string|boolean} The filter value suffix if any, false otherwise
	 */
	_getFilterValueSuffix(filterType) {
		return this._filterTypeExists(filterType) && this.constructor.filterTypes[filterType].valueSuffix ? this.constructor.filterTypes[filterType].valueSuffix : false;
	}

	/**
	 * Gets the Knex filter method from a filter type.
	 *
	 * @param {string} fieldName The field name
	 * @param {object} filter The filter data
	 * @return {string} The filter Knex method name.
	 */
	_getFilterMethod(fieldName, filter) {

		const filterType = this._getFilterType(fieldName, filter);

		const isMultiple = this._filterIsMultiple(fieldName, filter);

		if(isMultiple)
			return this.constructor.filterTypes[filterType].multipleMethod;

		return this.constructor.filterTypes[filterType].method || 'where';
	}

	/**
	 * Gets the filter parameters. Formatted field, operator if necesary and value if necesary
	 *
	 * @param {string} fieldName The field name
	 * @param {mixed} filter The filter data
	 * @return {Array} The filter parameters.
	 */
	_getFilterParams(fieldName, filter) {

		const filterParams = [
			this._getFormattedField(fieldName)
		];

		if(this._isFlagField(fieldName))
			filterParams[0] += ' = ?';

		const filterType = this._getFilterType(fieldName, filter);

		const filterOperator = this._getFilterOperator(filterType);

		if(filterOperator)
			filterParams.push(filterOperator);

		if(this._filterNeedsValue(filterType))
			filterParams.push(this._prepareFilterValue(fieldName, filter));

		return filterParams;
	}

	/**
	 * Gets the filter operator if any
	 *
	 * @param {string} filterType The filter type
	 * @return {(boolean|string)} The filter operator is any, false otherwise
	 */
	_getFilterOperator(filterType) {
		return this.constructor.filterTypes[filterType].operator || false;
	}

	/**
	 * Build Order By. Call Knex orderBy with order in params
	 *
	 */
	_buildOrder() {

		let { order } = this.params;

		if(!order)
			return;

		if(typeof order === 'string')
			order = { [order]: 'asc' };

		if(Array.isArray(order))
			throw new QueryBuilderError('Param order must be an object or string');

		for(const [fieldName, direction] of Object.entries(order)) {

			if(!this._validateOrderItem(fieldName, direction))
				throw this.error;

			const formattedField = this._getFormattedField(fieldName);

			if(this._isFlagField(fieldName))
				this.knexStatement.orderByRaw(`${formattedField} ${direction}`);
			else
				this.knexStatement.orderBy(formattedField, direction);
		}
	}

	/**
	 * Validates an order item
	 *
	 * @param {string} fieldName The field name
	 * @param {string} direction The order by direction (asc, desc)
	 * @return {boolean} true if valid, false otherwise
	 */
	_validateOrderItem(fieldName, direction) {

		if(!this._validateField(fieldName))
			return false;

		if(direction !== 'asc' && direction !== 'desc') {
			this.error = new QueryBuilderError(`Order By direccion must be 'asc' or 'desc', direction received '${direction}'`);
			return false;
		}

		return true;
	}

	/**
	 * Builds group by function.
	 *
	 */
	_buildGroup() {

		let { group } = this.params;

		if(typeof group === 'undefined' || group === false)
			return;

		if(typeof group === 'string')
			group = [group];
		else if(!Array.isArray(group))
			throw new QueryBuilderError('Param \'group\' must be string or an array');

		if(!group.length)
			throw new QueryBuilderError(`Param 'group' must have some fields, check ${this.modelName}.fields`);

		group = Utils.arrayUnique(group);

		group.forEach(fieldName => {

			if(!this._validateGroupItem(fieldName))
				throw this.error;

			const formattedField = this._getFormattedField(fieldName);

			if(this._isFlagField(fieldName))
				this.knexStatement.groupByRaw(formattedField);
			else
				this.knexStatement.groupBy(formattedField);
		});
	}

	/**
	 * Validates a group item
	 *
	 * @param {string} fieldName The field name
	 * @return {boolean} true if valid, false otherwise
	 */
	_validateGroupItem(fieldName) {

		if(!this._validateField(fieldName))
			return false;

		return true;
	}

	/**
	 * Build Limit and Offset. Call Knex limit and offset methods with params
	 *
	 */
	_buildLimit() {

		let { limit } = this.params;

		if(limit) {

			limit = Number(limit);

			if(!Number.isNaN(limit) || Number.isInteger(limit))
				this.knexStatement.limit(limit);
			else
				throw new QueryBuilderError('Invalid \'limit\' format, \'limit\' must be an integer');
		}

		let { page } = this.params;

		if(page) {

			page = Number(page);

			if(Number.isNaN(page) || !Number.isInteger(page))
				throw new QueryBuilderError('Invalid \'page\' format, \'page\' must be an integer');

			if(!limit)
				throw new QueryBuilderError('Param \'limit\' is required when param page given');

			const offset = (page - 1) * limit;

			this.knexStatement.offset(offset);
		} else {

			let { offset } = this.params;

			if(!offset)
				return;

			offset = Number(offset);

			if(Number.isNaN(offset) || !Number.isInteger(offset))
				throw new QueryBuilderError('Invalid \'offset\' format, \'offset\' must be an integer');

			this.knexStatement.offset(offset);
		}
	}

	/**
	 * Executes the Knex Statement
	 *
	 * @return {Promise} The promise
	 */
	async execute() {
		return this.knexStatement;
	}

}

module.exports = QueryBuilder;
