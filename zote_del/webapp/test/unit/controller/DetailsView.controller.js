/*global QUnit*/

sap.ui.define([
	"zotedel/controller/DetailsView.controller"
], function (Controller) {
	"use strict";

	QUnit.module("DetailsView Controller");

	QUnit.test("I should test the DetailsView controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
