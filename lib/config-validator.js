'use strict';

const MySQLConfigError = require('./mysql-config-error');

const MYSQL_CONFIG_STRUCT = {
	host: 'string',
	user: 'string',
	password: 'string',
	database: 'string',
	port: 'number',
	connectionLimit: 'number',
	prefix: 'string'
};

class ConfigValidator {

	/**
     * Validate the received config struct
     * @throws if the struct is invalid
     */
	static validate(config) {

		if(!config || typeof config !== 'object' || Array.isArray(config))
			throw new MySQLConfigError('Invalid config: Should be an object.', MySQLConfigError.codes.INVALID_CONFIG);

		for(const [setting, type] of Object.entries(MYSQL_CONFIG_STRUCT)) {

			if(config[setting] && typeof config[setting] !== type) { // eslint-disable-line
				throw new MySQLConfigError(`Invalid setting '${setting}': Expected ${type} but received ${typeof config[setting]}.`,
					MySQLConfigError.codes.INVALID_SETTING);
			}
		}
	}
}

module.exports = ConfigValidator;
