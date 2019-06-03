# MySql

[![Build Status](https://travis-ci.org/janis-commerce/mysql.svg?branch=JCN-49-janis-mysql)](https://travis-ci.org/janis-commerce/mysql)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/mysql/badge.svg?branch=JCN-49-janis-mysql)](https://coveralls.io/github/janis-commerce/mysql?branch=JCN-49-janis-mysql)

## Installation

```
npm install @janiscommerce/mysql
```

## API

* `new MySQL(config)`

    MySQL driver Module. `config` object with the database configuration.

* `save(model, item)`

    Saved an item in the database. Returns the Row affected
        - `model` a Model class, used to setup correctly the insertion.
        - `item` the object to be saved.

* `get(model, parametres)`

    Search in the database and return a `Promise` with the results.
        - `model` a Model class, used to get the correct search.
        - `parametres` it's an `object` with the field and options to make the query.

* `insert(model, values, allowUpserted)`

    Insert or Update a Row. Returns the Row affected

* `update(model, item)`

    Update a row.

* `multiInsert(model, items)`

    Performs a multi insert.

* `remove()`

## Config

The configuration object looks like:

```javascript

const config = {
    host: 'someHost', // host name where the database is connected
    user: 'yourUser', // username 
    password: 'yourPassword', // password
    database: 'your_database_name', // the database name, could not exist
    port: 3006, // the port where the database is connected
    connectionLimit: 5000, // A connection limit, 5000 by default
    prefix: 'yourPrefix' // if you use some prefix, could not exist
}

```

- - -

## Usage