'use strict';

const assert = require('assert');

const Utils = require('./../utils');

/** Setup **/

/* eslint-disable prefer-arrow-callback */

describe('Utils', function() {

	describe('Should convert keys to CamelCase', function() {
		const data = {
			order_form_id: 'yes',
			check_boolean: true,
			check_int: 5,
			status: true
		};

		const result = Utils.convertKeysToCamelCase(data);

		assert.equal(result.orderFormId, 'yes');
		assert.equal(result.checkBoolean, true);
		assert.equal(result.checkInt, 5);

		assert.equal(result.status, true);

		assert.equal(result.order_form_id, undefined);
		assert.equal(result.check_boolean, undefined);
		assert.equal(result.check_int, undefined);
	});

	describe('Should convert string to snake_case', function() {
		assert.equal(Utils.convertToSnakeCase('orderFormId'), 'order_form_id');
		assert.equal(Utils.convertToSnakeCase('checkBoolean'), 'check_boolean');
		assert.equal(Utils.convertToSnakeCase('status'), 'status');
	});

	describe('isObject', function() {

		it('Should return false for non objects', function() {
			assert(!Utils.isObject());
			assert(!Utils.isObject(null));
			assert(!Utils.isObject(true));
			assert(!Utils.isObject(1));
			assert(!Utils.isObject('str'));
			assert(!Utils.isObject([]));
			assert(!Utils.isObject(new Date()));
		});

		it('Should return false for objects', function() {
			assert(Utils.isObject({}));
			assert(Utils.isObject({ yes: 'no' }));
		});
	});

	describe('arrayUnique', function() {

		it('Should be a unique array', function() {
			assert.deepEqual(Utils.arrayUnique([1, 2]), [1, 2]);
			assert.deepEqual(Utils.arrayUnique([1, 2, 2]), [1, 2]);
			assert.deepEqual(Utils.arrayUnique(), []);
			assert.deepEqual(Utils.arrayUnique([]), []);
		});
	});

	describe('isEmptyObject', function() {

		it('should return true', function() {
			assert(Utils.isEmptyObject({}));
		});

		it('should return false', function() {
			assert(!Utils.isEmptyObject());

			[0, -1, 1, 'foo', 0, true, false, null, undefined, [1], [1, 2], [], { foo: 'bar' }].forEach(item => {
				assert(!Utils.isEmptyObject(item));
			});
		});
	});

});

/* eslint-enable */
