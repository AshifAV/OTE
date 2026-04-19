sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("zautosales.controller.MainView", {

        formatter: {
            formatStock: function (sValue) {
                if (!sValue) return "0";
                var num = parseFloat(sValue);
                return isNaN(num) ? "0" : num.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2});
            },

            formatPrice: function (sValue) {
                if (!sValue) return "0.00";
                var num = parseFloat(sValue);
                return isNaN(num) ? "0.00" : num.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            },

            getQuantity: function (oLocalData, oContext) {
                if (!oContext || typeof oContext.getPath !== "function") return "";
                var sPath = oContext.getPath();
                return oLocalData && oLocalData[sPath] ? (oLocalData[sPath].Quantity || "") : "";
            }
        },

        onInit: function () {
            var oTable = this.byId("materialTable");
            oTable.attachUpdateFinished(this.onTableUpdateFinished, this);
            oTable.attachSelectionChange(this.onSelectionChange, this);

            this._oLocalModel = new sap.ui.model.json.JSONModel({});
            this.getView().setModel(this._oLocalModel, "local");
        },


        onQuantityChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext();

            if (!oContext) return;

            var sPath = oContext.getPath();
            var sValue = oInput.getValue().trim();
            var fQty = sValue === "" ? 0 : parseFloat(sValue) || 0;

            var oData = this._oLocalModel.getData() || {};
            oData[sPath] = oData[sPath] || {};
            oData[sPath].Quantity = fQty;

            this._oLocalModel.setData(oData);
        },

        getSelectedItemsWithQuantity: function () {
            var oTable = this.byId("materialTable");
            var aSelectedItems = oTable.getSelectedItems();
            var aResult = [];

            aSelectedItems.forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                if (oContext) {
                    var oData = oContext.getObject();
                    var sPath = oContext.getPath();
                    
                    var oLocalData = this._oLocalModel.getData();
                    var oLocal = oLocalData[sPath];

                    aResult.push({
                        Matnr: oData.Matnr,
                        Werks: oData.Werks,
                        Lgort: oData.Lgort,
                        Maktx: oData.Maktx,
                        Labst: oData.Labst,
                        Kbetr: oData.Kbetr,
                        Quantity: oLocal && oLocal.Quantity !== undefined ? oLocal.Quantity : 0
                    });
                }
            }.bind(this));

            return aResult;
        },

        clearAllQuantities: function () {
            if (this._oLocalModel) {
                this._oLocalModel.setData({});
            }
        },

        onTableUpdateFinished: function () {
            var oTable = this.byId("materialTable");
            this._updateTotalCount(oTable.getItems().length);
            this.clearAllQuantities();
        },

        _updateTotalCount: function (iCount) {
            var oText = this.byId("totalCountText");
            if (oText) oText.setText("Total: " + iCount);
        },

        _updateSelectedCount: function (iCount) {
            var oSel = this.byId("selectedCountText");
            var oProc = this.byId("processButton");
            var oFoot = this.byId("footerProcessButton");

            if (iCount > 0) {
                oSel.setText(iCount + " item(s) selected").setState("Success");
                oProc.setEnabled(true);
                oFoot.setEnabled(true);
            } else {
                oSel.setText("No items selected").setState("Information");
                oProc.setEnabled(false);
                oFoot.setEnabled(false);
            }
        },

        onSelectionChange: function () {
            var oTable = this.byId("materialTable");
            this._updateSelectedCount(oTable.getSelectedItems().length);
        },

        onProcessSelected: function () {
            var aItems = this.getSelectedItemsWithQuantity();

            if (aItems.length === 0) {
                MessageBox.information("Please select at least one item");
                return;
            }

            var aValid = aItems.filter(item => item.Quantity > 0);

            if (aValid.length === 0) {
                MessageBox.warning("Please enter quantity greater than 0 for selected items");
                return;
            }

            var that = this;
            MessageBox.confirm("Create Sales Order for " + aValid.length + " item(s)?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._createSalesOrder(aValid);
                    }
                }
            });
        },

        onRefresh: function () {
            var oBinding = this.byId("materialTable").getBinding("items");
            if (oBinding) {
                this.getView().setBusy(true);
                this.clearAllQuantities();
                this.onClearSelection();

                oBinding.refresh();
                var that = this;
                oBinding.attachEventOnce("dataReceived", function () {
                    that.getView().setBusy(false);
                    MessageToast.show("Data refreshed successfully");
                });
            }
        },

        onClearSelection: function (oEvent) {
            var oTable = this.byId("materialTable");
            oTable.getSelectedItems().forEach(item => item.setSelected(false));

            this.clearAllQuantities();
            this._updateSelectedCount(0);

            if (oEvent) MessageToast.show("Selection and quantities cleared");
        }
    });
});