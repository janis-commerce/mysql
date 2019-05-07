'use strict';

/**
* @namespace
*/
const Utils = {

	/**
	*	Return whether the variable is an object or not
	*	@param {mixed} item
	*/
	isObject(item) {
		return (!!item) && (item.constructor === Object);
	},

	/**
	*	Convert a string to camelCase
	*	@param {string} The string to convert
	* @return {string} The modfied string
	*/
	convertToCamelCase(str) {
		return str.replace(/_([a-z])/g, letter => letter[1].toUpperCase());
	},

	/**
	*	Convert a string to snake_case
	*	@param {string} The string to convert
	* @return {string} The modfied string
	*/
	convertToSnakeCase(str) {
		return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
	},

	/**
	*	Convert all keys to camelCase from lower_dash
	*	@param {object} The object to convert
	* @return {object} The modfied object
	*/
	convertKeysToCamelCase(obj) {
		const result = {};

		for(const [key, value] of Object.entries(obj)) {

			const camelCaseKey = Utils.convertToCamelCase(key);

			result[camelCaseKey] = value;
		}

		return result;
	},

	/**
	 * Make unique an array
	 *
	 * @param {array} items The items
	 * @return {array} The items without repetitions
	 */
	arrayUnique(items = []) {
		return items.filter((item, index) => items.indexOf(item) === index);
	},

	/**
	 * Determines if is an empty object.
	 *
	 * @param {any} any Any variable
	 * @return {boolean} True if empty object, False otherwise.
	 */
	isEmptyObject(any) {
		return any !== null && typeof any === 'object' && !Array.isArray(any) && !Object.keys(any).length;
	}

};

module.exports = Utils;
