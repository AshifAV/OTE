sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment",
	"sap/ui/model/json/JSONModel"
], (Controller, Dialog, Button, MessageToast, Fragment, JSONModel) => {
	"use strict";

	return Controller.extend("zotedel.controller.DetailsView", {
		onInit() {

			this._oViewModel = new JSONModel({
				InvoiceNo: ""
			});
			this.getView().setModel(this._oViewModel, "view");
			this.createDialog('InvoiceSelect');

		},

		createDialog: function (fragmentId) {
			var that = this;

			if (fragmentId === 'InvoiceSelect') {

				// 1. Create dialog instance and save it to controller
				this._oInvoiceDialog = new Dialog({                     // <-- assign here
					title: 'Scan Invoice',
					resizable: true,
					draggable: true,
					stretch: sap.ui.Device.system.phone,

					beginButton: new Button({
						type: "Emphasized",
						text: 'Proceed',
						press: this._onProceed.bind(this)
					}),
					endButton: new Button({
						text: 'Cancel',
						press: function () {
							that._oInvoiceDialog.close();               // <-- use saved reference
						}
					}),

					afterClose: function () {
						this.destroy();                                 // 'this' = dialog here
						that._oInvoiceDialog = null;                    // <-- clean up reference
					}
				});

				// 2. Load fragment and add to dialog
				Fragment.load({
					id: this.getView().getId(),
					name: "zotedel.fragments.InvoiceSelect",
					controller: this
				}).then(function (oFragmentContent) {
					that._oInvoiceDialog.addContent(oFragmentContent);
					that.getView().addDependent(that._oInvoiceDialog);
					that._oInvoiceDialog.open();
				}).catch(function (oError) {
					MessageToast.show("Failed to load dialog: " + oError.message);
				});
			}
		},

		onScanSuccess: function (oEvent) {
			var sCode = oEvent.getParameter("text");
			this._oViewModel.setProperty("/InvoiceNo", sCode);
			MessageToast.show("Scanned: " + sCode);
		},

		onScanFail: function (oEvent) {
			MessageToast.show("Scan failed or cancelled");
		},

		_onProceed: function () {
			var sInvoice = this._oViewModel.getProperty("/InvoiceNo").trim();
			if (!sInvoice) {
				this._showError("Please enter or scan an invoice number");
				return;
			}

			sInvoice = sInvoice.padStart(10, "0");

			var oModel = this.getOwnerComponent().getModel();

			this._clearError();
			this.getView().setBusy(true);

			oModel.read("/ZDeliveryItemSet(InvoiceNo='" + sInvoice + "',ItemNo='000010')", {
				success: function () {
					this.getView().setBusy(false);
					if (this._oInvoiceDialog) {
						this._oInvoiceDialog.close();
					}
					var oTable = this.byId("idDeliveryTable");
					var oBinding = oTable.getBinding("items");

					oBinding.filter([
						new sap.ui.model.Filter("InvoiceNo", "EQ", sInvoice)
					]);

					oBinding.resume();  
					this._oViewModel.setProperty("/InvoiceNo", sInvoice);
					MessageToast.show("Invoice " + sInvoice + " is valid");

				}.bind(this),

				error: function (oError) {
					this.getView().setBusy(false);
					var sMsg = "Invalid invoice number";

					if (oError.responseText) {
						try {
							var oResp = JSON.parse(oError.responseText);
							sMsg = oResp.error.message.value || sMsg;
						} catch (e) {
							sMsg = oError.message || sMsg;
						}
					}
					this._showError(sMsg);
				}.bind(this)
			});
		},

		_showError: function (sText) {
			MessageToast.show(sText);
		},

		_clearError: function () {
			var oStrip = this.byId("msgStrip");
			if (oStrip) oStrip.setVisible(false);
		}
	});
});