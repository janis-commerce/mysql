# mysql

![Build Status](https://github.com/janis-commerce/mysql/workflows/Build%20Status/badge.svg?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/mysql/badge.svg?branch=master)](https://coveralls.io/github/janis-commerce/mysql?branch=master)
[![npm version](https://badge.fury.io/js/%40janiscommerce%2Fmysql.svg)](https://www.npmjs.com/package/@janiscommerce/mysql)

A Driver for **MySQL** Database.

- - -

## :inbox_tray: Installation

```
npm install @janiscommerce/mysql
```
- - -

## :hammer_and_wrench: Configuration

The **TABLES** must be created before start using this driver.

This driver use a configuration `object` with the database config data, it look like these :
Every field is *optional*.

* `host`: `[String]` Host name where the database is connected. *Default*: "localhost"
* `user`: `[String]` Username *Default*: "root"
* `password`: `[String]` User's Password. *Default*: ""
* `database`: `[String]` Database name. *Default*: `null`
* `port`: `[String]` Port where the database is connected. *Default*: 3306
* `connectionLimit`: `[String]`  A connection limit. *Default*: 500

If some Fields has the wrong type will be thrown a `MySQLConfigError`.

```javascript

const config = {
    host: 'someHost',
    user: 'yourUser',
    password: 'yourPassword',
    database: 'your_database_name',
    port: 3006,
    connectionLimit: 5000
}

```
- - -

## API

* `new MySQL(config)`, MySQL constructor, to start using it.

    - `config`: *type* `OBJECT`, the database configuration.

* `insert(model, item)` **ASYNCHRONOUS**, Insert an individual object in the database.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `item`: *type* `OBJECT`, the object to be inserted.
    - **Returns**, `ID` of the object inserted.

* `save(model, item)` **ASYNCHRONOUS**, Saved an individual object in the database. Duplicate Objects updates it.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `item`: *type* `OBJECT`,the object to be saved.
    - **Returns**, `ID` of the object inserted / updated.

* `multiInsert(model, items)` **ASYNCHRONOUS**, Performs an Insert of multiple objects. Duplicate Objects updates it.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `items`: *type* `ARRAY`, the list of objects to be saved.
    - **Returns**, `Promise` with `number` of the quantity of rows were updated correctly.

* `update(model, values, filters)` **ASYNCHRONOUS**, Update rows.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `values`: *type* `object`, *key*: field to change, *value*: new value.
    - `filters`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Filters.md).
    - **Returns**, `number` of the quantity of rows were updated correctly.


* `get(model, parameters)` **ASYNCHRONOUS**, Search rows in the database.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `parameters`: *type* `OBJECT`, with the following `keys` to make the query:
        * `fields`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Fields.md).
        * `filters`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Filters.md).
        * `joins`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Joins.md).
        * `order`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Orders.md).
        * `group`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Groups.md).
        * `limit`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Pagination.md).
        * *special functions*: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Special-functions.md).
    - **Returns**, `Array` of `objects` of *rows* founds.

* `getTotals(model)` **ASYNCHRONOUS**, Get the totals of the items from the latest `get` operation with pagination.
    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - **Returns**, `Object` with the total count, page size, pages and selected page.

* `remove(model, parameters)` **ASYNCHRONOUS**, Remove rows in the database.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `parameters`: *type* `OBJECT`, with the following `keys` to make the changes:
        - `filters`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Filters.md).
        - `joins`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Joins.md).
    - **Returns**, `number` of the quantity of rows were removed correctly.

* `multiRemove(model, parameters)` **ASYNCHRONOUS**, Remove rows in the database.

    - `model`: a Model instance with the *database*, *tables*, *fields*, *joins* and other data.
    - `parameters`: *type* `ARRAY`, with the following `keys` to make the changes:
        - `filters`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Filters.md).
        - `joins`: Learn [More](https://github.com/janis-commerce/query-builder/blob/master/docs/Joins.md).
    - **Returns**, `number` of the quantity of rows were removed correctly.


- - -

## Errors

The errors are informed with a `MySQLError` with the proper message for each error.

The codes are the following:

|Code	|Description				|
|-------|---------------------------|
|1		|Invalid Model  			|
|2		|Invalid Insert     		|
|3		|Invalid Save               |
|4		|Invalid Update	            |
|5      |Invalid Multi-Insert       |
|6      |Invalid Remove             |
|7      |Empty Fields               |

The errors in configs are informed with a `MySQLConfigError` with the proper message for each error.

The codes are the following:

|Code	|Description				|
|-------|---------------------------|
|1		|Invalid Config  			|
|2		|Invalid Settings     		|

- - -

## Usage

```javascript
const Mysql = require('@janiscommerce/mysql');

const config = {
    host: 'localhost',
    user: 'root',
    password: '20192106',
    database: 'fizzmod',
    port: 3006,
};

// Initialize
// Table Already Created

const mysql = new Mysql(config);

// Some Model with the right setup to use
// fields = id (primary key), name , genre, score
const movieModel = new movieModel();

let movieResponse;
let movieItem;
let movieItems;

// INSERT a new Item

movieItem = {
    id: 1,
    name: 'Titanic',
    genre: 'Drama',
    score: 2,
    nation: 'usa' // this field will not be inserted
};

try {
    movieResponse = await mysql.insert(movieModel, movieItem);
    // Response: 1
    console.log('Movie Saved'); // Print in Console
} catch (error) {
    console.log('These Movie can\'t be saved.');
}

// INSERT an Item that already exist

movieItem = {
    id: 1,
    name: 'Titanic',
    genre: 'Drama',
    score: 10
};

try {
    // will throw error
    movieResponse = await mysql.insert(movieModel, movieItem);
    console.log('Movie Saved');

} catch(error) {

    console.log('This Movie can\'t be saved.'); // Print in Console
}

// SAVE an Item that already exist

movieItem = {
    id: 1,
    name: 'Titanic',
    genre: 'Drama',
    score: 1
};

try {

    movieResponse = await mysql.save(movieModel, movieItem);
    // Update and Response: TRUE
    console.log('Movie Saved'); // Print in Console

} catch(error) {

    console.log('This Movie can\'t be saved.');
}

// SAVE an new Item

movieItem = {
    id: 2,
    name: 'Lord of the Rings 1',
    genre: 'Fantasy',
    score: 1
};

try {

    movieResponse = await mysql.save(movieModel, movieItem);
    // Insert and Response: 2
    console.log('Movie Saved'); // Print in Console

} catch(error) {

    console.log('This Movie can\'t be saved.');
}

// MULTI INSERT multiple Items

movieItems = [
    {
        id: 3,
        name: 'Lord of the Rings 2',
        genre: 'Fantasy',
        score: 8
    },
    {
        id: 4,
        name: 'Avengers 3',
        genre: 'Action',
        score: 9
    },
    {
        id: 5,
        name: 'Lord of the Rings 3',
        genre: 'Fantasy',
        score: 9
    },
    {
        id: 6,
        name: 'Scream',
        genre: 'Terror',
        score: 6
    },
    {
        id: 2,
        name: 'Lord of the Rings 1',
        genre: 'Fantasy',
        score: 7
    },
    {
        id: 7,
        name: 'Sharkanado',
        genre: 'Comedy',
        score: 3
    }
];

try {

    movieResponse = await mysql.multiInsert(movieModel, movieItem);
    // insert 4 movies and update 1,
    // Response: 5,
    console.log('Movies Saved', movieResponse); // Print in Console

} catch(error) {

    console.log('These Movie can\'t be saved.');
}

// MULTI INSERT multiple Items

let params = {
    fields: {
        score: 9
    },
    filters: {
        genre: 'Fantasy'
    }
};

try {

    movieResponse = await mysql.update(movieModel, params);
    // Response: 3
    console.log('Movies Updated', movieResponse); // Print in Console

} catch(error) {

    console.log('These Movie can\'t be update.');
}

// GET

params = {};

try {

    movieResponse = await mysql.get(movieModel, params);
    // Response: Array with All movies and his fields
    /*
        [
            { id: 1, name: 'Titanic', genre: 'Drama', score: 1, date_created: 1239218, date_modified: 1239918 },
            { id: 2, name: 'Lord of the Rings 1', genre: 'Fantasy', score: 9, date_created: 1240000, date_modified: 1242000 },
            ...
            { id: 4, name: 'Avengers 3', genre: 'Action', score: 1, date_created: 1241000, date_modified: 1241000 },
            ...
        ]
    */

   // getTotals
   const totals = await mysql.getTotals(movieModel);

   /* Example return
      {
         page: 1,
         limit: 500,
         pages: 1,
         total: 7
      }
   */
    console.log('Movies ', movieResponse); // Print in Console

} catch(error) {

    console.log('These Movie can\'t be get.');
}

// GET only fields required and with filters

params = {
    fields: ['name'],
    filters: {
        genre: 'Fantasy'
    }
};

try {

    movieResponse = await mysql.get(movieModel, params);
    // Response: Array with All movies with fields required and passed the filter
    /*
        [
            { id: 2, name: 'Lord of the Rings 1', genre: 'Fantasy', score: 9, date_created: 1240000, date_modified: 1242000 },
            { id: 3, name: 'Lord of the Rings 2', genre: 'Fantasy', score: 9, date_created: 1241000, date_modified: 1242000 },
            { id: 5, name: 'Lord of the Rings 3', genre: 'Fantasy', score: 9, date_created: 1241000, date_modified: 1242000 }
        ]
    */
    console.log('Movies ', movieResponse); // Print in Console

} catch(error) {

    console.log('These Movie can\'t be get.');
}

// REMOVE items

params = {
    filters: {
        genre: 'Terror'
    }
};

try {

    movieResponse = await mysql.remove(movieModel, params);
    // Response: 1
    console.log('Movies ', movieResponse); // Print in Console

} catch(error) {

    console.log('These Movie can\'t be removed.');
}

```