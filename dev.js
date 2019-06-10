
/* eslint-disable */

const MYSQL2 = require('./mysql/mysql');

const TABLE = "CREATE TABLE IF NOT EXISTS `fake_table6` ( `id` MEDIUMINT UNSIGNED AUTO_INCREMENT NOT NULL UNIQUE, `date_created` INT(11) NOT NULL,`date_modified` INT(11) NOT NULL, `campo_1` VARCHAR(50) NOT NULL, `campo_2` VARCHAR(50) NOT NULL, PRIMARY KEY(id));";
const INSERT = "INSERT INTO `prueba` (`title`) VALUES (:title);";
const SHOW_COLUMN = 'SHOW COLUMNS FROM `fizzmod`.`fakeTable`;'

const config = {
    host: "localhost",
    user: "root",
    password: "123",
    database: "fizzmod",
    port: 3306
}

class fake_model {

    static get name() {
        return 'fakeModel';
    }

    static get dbname() {
        return 'fizzmod';
    }

    static get table() {
        return 'fakeTable6';
    }

    get dbTable() {
        return 'fake_table6'
    }

    static getTable(){ // Save
        return 'fake_table6';
    }

    static get fields() {
        return {
            campo_1 : true,
            campo_2 : true
        }
    }
    
    static addDbName(table) {
        return 'fakeTable6';
    }
}

const mysql = new MYSQL2(config);

// mysql._call(TABLE).then(a => console.log(a)).catch(e => console.log(e.message));
// mysql._getFields(fake_model).then(a => console.log(a)).catch(e => console.log(e.message));
// mysql.insert(fake_model, {campo_1 : "Hola15", campo_2 : "pepe5"}).then(a => console.log(a)).catch(e => console.log(e.message));
// mysql.get(fake_model).then(a => console.log(a)).catch(e => console.log(e.message));
// mysql.update(fake_model, {campo_1: "Nada"} ).then(a => console.log(a)).catch(e => console.log(e.message));
// mysql.getTotals(fake_model).then(a => console.log(a)).catch(e => console.log(e.message));
// mysql.remove(fake_model,{ campo_2: "pepe4"}).then(a => console.log(a)).catch(e => console.log(e.message));

// Array(n).fill({}).map((elem,i) => i);  

const o = {
    a: "a",
    b: "b"
}

console.log(o.length);