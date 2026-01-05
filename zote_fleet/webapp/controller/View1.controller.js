sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/model/json/JSONModel"
], function (Controller, Filter, FilterOperator, MessageToast, MessageBox, ValueHelpDialog, JSONModel) {
    "use strict";

    return Controller.extend("zotefleet.controller.View1", {
        onInit: function () {
            this._initFormValidation();
        },

        _initFormValidation: function () {
            var oFormModel = new JSONModel({
                isFormValid: false,
                equipmentSelected: false,
                plateNumberEntered: false
            });

            this.getView().setModel(oFormModel, "form");

            var oEquipment = this.byId("idEquipment");
            var oPlateNumber = this.byId("idPlateNumber");

            if (oEquipment && oPlateNumber) {
                oEquipment.attachChange(function (oEvent) {
                    this._onEquipmentChange(oEvent);
                }.bind(this));

                oPlateNumber.attachChange(function (oEvent) {
                    this._onPlateNumberChange(oEvent);
                }.bind(this));
            }
        },

        _onEquipmentChange: function (oEvent) {
            var sValue = oEvent.getSource().getValue();
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/equipmentSelected", !!sValue);
            this._validateForm();
        },

        _onPlateNumberChange: function (oEvent) {
            var sValue = oEvent.getSource().getValue();
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/plateNumberEntered", !!sValue);
            this._validateForm();
        },

        _validateForm: function () {
            var oFormModel = this.getView().getModel("form");
            var bEquipmentSelected = oFormModel.getProperty("/equipmentSelected");
            var bPlateNumberEntered = oFormModel.getProperty("/plateNumberEntered");

            oFormModel.setProperty("/isFormValid", bEquipmentSelected && bPlateNumberEntered);

            var oUpdateButton = this.byId("updateButton");
            if (oUpdateButton) {
                oUpdateButton.setEnabled(bEquipmentSelected && bPlateNumberEntered);
            }
        },

        onEquipmentValueHelp: function (oEvent) {
            var oInput = oEvent.getSource();

            if (!this._oValueHelpDialog) {

                var oSearchField = new sap.m.SearchField({
                    placeholder: "Search Equipment or Description...",
                    search: this._onSearch.bind(this),
                    liveChange: this._onSearch.bind(this)
                });

                this._oValueHelpDialog = new ValueHelpDialog({
                    title: "Select Equipment",
                    supportMultiselect: false,
                    supportRanges: false,
                    key: "EQUNR",
                    descriptionKey: "EQKTX",
                    ok: this._onValueHelpOk.bind(this),
                    cancel: function () {
                        this.close();
                    }
                });

                var oTable = new sap.m.Table({
                    growing: true,
                    growingThreshold: 20,
                    growingScrollToLoad: true,
                    headerToolbar: new sap.m.Toolbar({
                        content: [
                            new sap.m.ToolbarSpacer(),
                            oSearchField
                        ]
                    }),
                    columns: [
                        new sap.m.Column({ header: new sap.m.Text({ text: "Equipment Number" }), width: "30%" }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Description" }), width: "70%" })
                    ]
                });

                var oTemplate = new sap.m.ColumnListItem({
                    type: "Active",
                    cells: [
                        new sap.m.Text({
                            text: {
                                path: "EQUNR",
                                formatter: this.formatEqunrNoLeadingZeros.bind(this)
                            }
                        }),
                        new sap.m.Text({ text: "{EQKTX}" })
                    ]
                });

                oTable.bindItems({
                    path: "/EquipmentSet",
                    parameters: {
                        $orderby: "EQUNR asc"
                    },
                    template: oTemplate
                });

                this._oValueHelpDialog.setTable(oTable);
                this._oValueHelpDialog.getTable().setModel(this.getView().getModel());

                this._oVHDTable = oTable;
                this._oVHDSearchField = oSearchField;
                this._sLastSearchValue = "";

                this._oValueHelpDialog.setContentWidth("650px");
                this._oValueHelpDialog.setContentHeight("650px");

                this.getView().addDependent(this._oValueHelpDialog);
            }

            this._oVHDSearchField.setValue("");
            this._sLastSearchValue = "";

            var oBinding = this._oVHDTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
                oBinding.sort(null);
                oBinding.refresh();
            }

            this._oVHDTable.setGrowing(true);

            this._oValueHelpDialog.open();
        },

        _onValueHelpOk: function (oEvt) {
            var aTokens = oEvt.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                var sEqunr = aTokens[0].getKey();
                var sFullText = aTokens[0].getText();
                var sEqunrClean = sEqunr.replace(/^0+/, '') || "0";
                var sDescription = this._extractDescription(sFullText, sEqunr);
                this.byId("idEquipment").setValue(sEqunrClean);
                this.byId("idEquipmentDescription").setText(sDescription || "No description available");
                this._onEquipmentChange({
                    getSource: function () {
                        return { getValue: function () { return sEqunrClean; } }
                    }
                });
                this._loadFleetData(sEqunrClean);
            }

            if (this._oValueHelpDialog) {
                this._oValueHelpDialog.close();
            }
        },

        _loadFleetData: function (sEquipment) {
            var sPath = "/EquipmentSet('" + sEquipment + "')";
            var oModel = this.getView().getModel();

            oModel.read(sPath, {
                urlParameters: {
                    "$expand": "ToFleet"
                },
                success: function (oData) {
                    if (oData && oData.ToFleet) {
                        var oFleet = oData.ToFleet;
                        this.byId("idVIN").setValue(oFleet.FLEET_VIN || "");
                        this.byId("idChassis").setValue(oFleet.CHASSIS_NUM || "");
                        this.byId("idPlateNumber").setValue(oFleet.LICENSE_NUM || "");
                        this._onPlateNumberChange({
                            getSource: function () {
                                return { getValue: function () { return oFleet.LICENSE_NUM || ""; } }
                            }
                        });
                    } else {
                        MessageToast.show("No Fleet data found for this equipment");
                        this._clearFleetFields();
                    }
                }.bind(this),
                error: function (oError) {
                    MessageToast.show("Error loading Fleet details");
                    console.error("Error loading Fleet data:", oError);
                    this._clearFleetFields();
                }.bind(this)
            });
        },

        onUpdatePress: function () {
            var sEquipment = this.byId("idEquipment").getValue();
            var sDescription = this.byId("idEquipmentDescription").getText();
            var sVIN = this.byId("idVIN").getValue();
            var sChassis = this.byId("idChassis").getValue();
            var sPlateNumber = this.byId("idPlateNumber").getValue();

            if (!sEquipment) {
                MessageBox.error("Please select an equipment first");
                return;
            }

            if (!sPlateNumber) {
                MessageBox.error("Please enter a plate number");
                return;
            }

            MessageBox.confirm(
                "Are you sure you want to update the plate number for Equipment " +
                sEquipment + "?\n\n" +
                "New Plate Number: " + sPlateNumber,
                {
                    title: "Confirm Update",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            this._updateFleetData(sEquipment, sVIN, sChassis, sPlateNumber);
                        }
                    }.bind(this)
                }
            );
        },

        _updateFleetData: function (sEquipment, sVIN, sChassis, sPlateNumber) {
            var oModel = this.getView().getModel();
            var sPath = "/FleetSet('" + sEquipment + "')";

            var oPayload = {
                EQUNR: sEquipment,
                FLEET_VIN: sVIN || "",
                CHASSIS_NUM: sChassis || "",
                LICENSE_NUM: sPlateNumber
            };

            sap.ui.core.BusyIndicator.show(0);

            oModel.update(sPath, oPayload, {
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();
                    MessageToast.show("Plate number updated successfully!");
                    this._showStatusMessage("Update completed successfully", "Success");
                    this._loadFleetData(sEquipment);
                    console.log("Update successful:", oData);
                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    this._showStatusMessage("Update failed:Error");
                }.bind(this),
                merge: false
            });
        },


        _clearFleetFields: function () {
            this.byId("idVIN").setValue("");
            this.byId("idChassis").setValue("");
            this.byId("idPlateNumber").setValue("");
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/plateNumberEntered", false);
            this._validateForm();
        },

        onClearPress: function () {

            MessageBox.confirm(
                "Are you sure you want to clear all fields?",
                {
                    title: "Confirm Clear",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            this.byId("idEquipment").setValue("");
                            this.byId("idEquipmentDescription").setText("No equipment selected");
                            this._clearFleetFields();

                            var oFormModel = this.getView().getModel("form");
                            oFormModel.setProperty("/equipmentSelected", false);
                            oFormModel.setProperty("/isFormValid", false);

                            MessageToast.show("All fields cleared");
                        }
                    }.bind(this)
                }
            );
        },

        _onSearch: function (oEvent) {
            var sValue = oEvent.getParameter("query") || oEvent.getParameter("newValue");
            this._sLastSearchValue = sValue || "";

            if (!this._oVHDTable) {
                return;
            }

            var oBinding = this._oVHDTable.getBinding("items");
            if (!oBinding) {
                return;
            }

            var aFilters = [];

            if (sValue && sValue.trim() !== "") {
                var oFilter1 = new Filter({
                    path: "EQUNR",
                    operator: FilterOperator.EQ,
                    value1: sValue
                });

                var oFilter2 = new Filter({
                    path: "EQKTX",
                    operator: FilterOperator.EQ,
                    value1: sValue
                });

                aFilters = new Filter({
                    filters: [oFilter1, oFilter2],
                    and: false
                });

                oBinding.filter(aFilters);
                oBinding.refresh();
                this._oVHDTable.setGrowing(false);
            } else {
                oBinding.filter([]);
                oBinding.refresh();
                this._oVHDTable.setGrowing(true);
            }
        },

        formatEqunrNoLeadingZeros: function (sValue) {
            if (!sValue) return "";
            return sValue.replace(/^0+/, '') || "0";
        },

        _showStatusMessage: function (sMessage, sType) {
            var oStatusArea = this.byId("statusArea");
            var oMessageStrip = this.byId("statusMessage");

            if (oStatusArea && oMessageStrip) {
                oMessageStrip.setText(sMessage);
                oMessageStrip.setType(sType);
                oStatusArea.setVisible(true);
            }
        },

        _extractDescription: function (sFullText, sEqunr) {
            if (!sFullText || !sEqunr) {
                return sFullText || "";
            }

            var sEqunrPattern = "\\s*\\(" + sEqunr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\)$";
            var sDescription = sFullText.replace(new RegExp(sEqunrPattern), "");


            sDescription = sDescription.trim();

            return sDescription || sFullText;
        }

    });
});