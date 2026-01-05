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
            // Initialize form validation model
            this._initFormValidation();
        },

        _initFormValidation: function() {
            // Create a JSON model for form validation
            var oFormModel = new JSONModel({
                isFormValid: false,
                equipmentSelected: false,
                plateNumberEntered: false
            });
            
            this.getView().setModel(oFormModel, "form");
            
            // Bind validation to input changes
            var oEquipment = this.byId("idEquipment");
            var oPlateNumber = this.byId("idPlateNumber");
            
            if (oEquipment && oPlateNumber) {
                oEquipment.attachChange(function(oEvent) {
                    this._onEquipmentChange(oEvent);
                }.bind(this));
                
                oPlateNumber.attachChange(function(oEvent) {
                    this._onPlateNumberChange(oEvent);
                }.bind(this));
            }
        },

        _onEquipmentChange: function(oEvent) {
            var sValue = oEvent.getSource().getValue();
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/equipmentSelected", !!sValue);
            this._validateForm();
        },

        _onPlateNumberChange: function(oEvent) {
            var sValue = oEvent.getSource().getValue();
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/plateNumberEntered", !!sValue);
            this._validateForm();
        },

        _validateForm: function() {
            var oFormModel = this.getView().getModel("form");
            var bEquipmentSelected = oFormModel.getProperty("/equipmentSelected");
            var bPlateNumberEntered = oFormModel.getProperty("/plateNumberEntered");
            
            oFormModel.setProperty("/isFormValid", bEquipmentSelected && bPlateNumberEntered);
            
            // Also update button directly as backup
            var oUpdateButton = this.byId("updateButton");
            if (oUpdateButton) {
                oUpdateButton.setEnabled(bEquipmentSelected && bPlateNumberEntered);
            }
        },

        onEquipmentValueHelp: function (oEvent) {
            var oInput = oEvent.getSource();

            if (!this._oValueHelpDialog) {
                // SearchField with server-side search
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

                // Initial binding without filters
                oTable.bindItems({
                    path: "/EquipmentSet",
                    parameters: {
                        $orderby: "EQUNR asc"
                    },
                    template: oTemplate
                });

                this._oValueHelpDialog.setTable(oTable);
                this._oValueHelpDialog.getTable().setModel(this.getView().getModel());

                // Store the table reference for later filtering
                this._oVHDTable = oTable;
                this._oVHDSearchField = oSearchField;
                this._sLastSearchValue = "";

                // Dialog size
                this._oValueHelpDialog.setContentWidth("650px");
                this._oValueHelpDialog.setContentHeight("650px");

                this.getView().addDependent(this._oValueHelpDialog);
            }

            // Clear previous search and show all items on open
            this._oVHDSearchField.setValue("");
            this._sLastSearchValue = "";

            // Reset to initial state
            var oBinding = this._oVHDTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
                oBinding.sort(null);
                oBinding.refresh();
            }

            // Make sure growing is enabled
            this._oVHDTable.setGrowing(true);

            this._oValueHelpDialog.open();
        },

        _onValueHelpOk: function (oEvt) {
            var aTokens = oEvt.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                var sEqunr = aTokens[0].getKey();
                var sDescription = aTokens[0].getText();

                // Always remove leading zeros → external format
                var sEqunrClean = sEqunr.replace(/^0+/, '') || "0";

                // Display clean value and description
                this.byId("idEquipment").setValue(sEqunrClean);
                this.byId("idEquipmentDescription").setValue(sDescription || "No description available");
                
                // Trigger form validation
                this._onEquipmentChange({getSource: function() { 
                    return {getValue: function() { return sEqunrClean; }} 
                }});
                
                MessageToast.show("Equipment selected: " + sEqunrClean);

                // Load Fleet data with $expand
                this._loadFleetData(sEqunrClean);
            }

            // Close the dialog
            if (this._oValueHelpDialog) {
                this._oValueHelpDialog.close();
            }
        },

        _loadFleetData: function (sEquipment) {
            var sPath = "/EquipmentSet('" + sEquipment + "')";
            var oModel = this.getView().getModel();

            // Use $expand parameter properly
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
                        
                        // Trigger plate number validation
                        this._onPlateNumberChange({getSource: function() { 
                            return {getValue: function() { return oFleet.LICENSE_NUM || ""; }} 
                        }});
                        
                        MessageToast.show("Fleet details loaded successfully");
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
            // Get current values
            var sEquipment = this.byId("idEquipment").getValue();
            var sDescription = this.byId("idEquipmentDescription").getValue();
            var sVIN = this.byId("idVIN").getValue();
            var sChassis = this.byId("idChassis").getValue();
            var sPlateNumber = this.byId("idPlateNumber").getValue();

            // Validate input
            if (!sEquipment) {
                MessageBox.error("Please select an equipment first");
                return;
            }

            if (!sPlateNumber) {
                MessageBox.error("Please enter a plate number");
                return;
            }

            // Show confirmation dialog
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

            // Prepare the update payload
            var oPayload = {
                EQUNR: sEquipment,
                FLEET_VIN: sVIN || "",
                CHASSIS_NUM: sChassis || "",
                LICENSE_NUM: sPlateNumber
            };

            // Show loading indicator
            sap.ui.core.BusyIndicator.show(0);

            // Update using PATCH method
            oModel.update(sPath, oPayload, {
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();
                    MessageToast.show("Plate number updated successfully!");

                    // Optional: Refresh the data to show updated values
                    this._loadFleetData(sEquipment);

                    // Log success
                    console.log("Update successful:", oData);
                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();

                    // Check if it's a "not found" error (record doesn't exist)
                    if (oError.statusCode === "404") {
                        // Try to create new record instead
                        this._createFleetData(sEquipment, sVIN, sChassis, sPlateNumber);
                    } else {
                        MessageBox.error(
                            "Error updating plate number: " +
                            (oError.message || "Unknown error")
                        );
                        console.error("Update error:", oError);
                    }
                }.bind(this),
                merge: false  // Send complete entity, not just changed fields
            });
        },


        _clearFleetFields: function () {
            this.byId("idVIN").setValue("");
            this.byId("idChassis").setValue("");
            this.byId("idPlateNumber").setValue("");
            
            // Update validation state
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/plateNumberEntered", false);
            this._validateForm();
        },

        onClearPress: function () {
            // Show confirmation before clearing
            MessageBox.confirm(
                "Are you sure you want to clear all fields?",
                {
                    title: "Confirm Clear",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            this.byId("idEquipment").setValue("");
                            this.byId("idEquipmentDescription").setValue("No equipment selected");
                            this._clearFleetFields();
                            
                            // Update validation state
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
        }
    });
});