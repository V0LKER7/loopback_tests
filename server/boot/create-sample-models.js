// Copyright IBM Corp. 2014,2019. All Rights Reserved.
// Node module: loopback-getting-started

"use strict";

module.exports = async function (app) {
	await app.dataSources.todo.autoupdate();
	// const todolist = await app.models.Todo.create([
	// 	{
	// 		title: "shajkakl",
	// 		date: "10.10.2020",
	// 	},
	// 	{
	// 		title: "do dom",
	// 		date: "10.10.2020",
	// 	},
	// 	{
	// 		title: "shakal dum dum",
	// 		date: "10.10.2020",
	// 	},
	// ]);
	/*
	
  
  console.log("Models created: \n", todolist);
  */
};
