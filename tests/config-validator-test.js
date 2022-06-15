'use strict';

const assert = require('assert');

const { MySQLConfigError, ConfigValidator } = require('./../lib');

describe('Config Validator', () => {

	context('when config is wrong', () => {

		it('Should throw Error when config not exists', () => {
			assert.throws(() => ConfigValidator.validate(), { code: MySQLConfigError.codes.INVALID_CONFIG });
		});

		it('Should throw Error when config is not an object', () => {
			assert.throws(() => ConfigValidator.validate('config'), { code: MySQLConfigError.codes.INVALID_CONFIG });
		});

		it('Should throw Error when config is an array', () => {
			assert.throws(() => ConfigValidator.validate(['config']), { code: MySQLConfigError.codes.INVALID_CONFIG });
		});
	});

	context('when config has a wrong type value', () => {
		const configs = [
			{ host: ['localhost'] },
			{ port: '1234' },
			{ database: { db: 'myDB' } },
			{ connectionLimit: '1000' },
			{ user: ['root'] },
			{ password: { root: '12345678' } }
		];

		configs.forEach(config => {

			const value = Object.keys(config)[0];

			it(`Should throw error if value ${value} has incorrect format`, () => {
				assert.throws(() => ConfigValidator.validate(config), { code: MySQLConfigError.codes.INVALID_SETTING });
			});
		});
	});

	context('when config has right value', () => {
		const config = {
			host: 'someHost',
			user: 'root',
			password: 'root1234',
			database: 'someDB',
			port: 30015,
			connectionLimit: 5000
		};


		it('Should not throw error', () => {
			assert.doesNotThrow(() => ConfigValidator.validate(config));
		});
	});


});
