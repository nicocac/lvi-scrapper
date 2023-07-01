var mysql = require('mysql');


var pool = mysql.createPool({
    connectionLimit:4,
    host: "127.0.0.1",
    user: "root",
    password: "root",
    database: "real_scrap"
});

pool.getConnection((err,connection)=> {
  if(err)
  throw err;
  console.log('Database connected successfully');
  connection.release();
});

module.exports = pool;