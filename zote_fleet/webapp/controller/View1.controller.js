sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Sorter",
    "sap/m/Link"
], function (Controller, Filter, FilterOperator, MessageToast, MessageBox, ValueHelpDialog, JSONModel, Sorter, Link) {
    "use strict";

    return Controller.extend("zotefleet.controller.View1", {
        onInit: function () {
            this._initModels();
            this._setupSearchMode();
        },

        _initModels: function () {
            var oFormModel = new JSONModel({
                customer: "",
                equipment: "",
                vin: "",
                searchMode: "customer",
                hasChanges: false,
                selectedItem: null
            });
            this.getView().setModel(oFormModel, "form");

            var oTableModel = new JSONModel({
                equipmentItems: [],
                changedItems: [],
                selectedEquipment: null
            });
            this.getView().setModel(oTableModel, "table");
        },

        _setupSearchMode: function () {
            var oSelect = this.byId("idSearchMode");
            if (oSelect) {
                oSelect.setSelectedKey("customer");
            }
        },

        onCustomerValueHelp: function (oEvent) {
            this._showCustomerDialog();
        },

        _showCustomerDialog: function () {
            if (!this._oCustomerVHDialog) {
                var oSearchField = new sap.m.SearchField({
                    placeholder: "Search Customer ID or Name...",
                    search: this._onCustomerSearch.bind(this),
                    liveChange: this._onCustomerSearch.bind(this)
                });

                this._oCustomerVHDialog = new ValueHelpDialog({
                    title: "Select Customer",
                    supportMultiselect: false,
                    supportRanges: false,
                    key: "KUNNR",
                    descriptionKey: "NAME1",
                    ok: this._onCustomerDialogOk.bind(this),
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
                        new sap.m.Column({ header: new sap.m.Text({ text: "Customer ID" }), width: "30%" }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Customer Name" }), width: "70%" })
                    ]
                });

                var oTemplate = new sap.m.ColumnListItem({
                    type: "Active",
                    cells: [
                        new sap.m.Text({
                            text: {
                                path: "KUNNR",
                                formatter: this.formatKunnrNoLeadingZeros.bind(this)
                            }
                        }),
                        new sap.m.Text({ text: "{NAME1}" })
                    ]
                });

                oTable.bindItems({
                    path: "/CustomerSet",
                    parameters: {
                        "$orderby": "KUNNR asc"
                    },
                    template: oTemplate
                });

                this._oCustomerVHDialog.setTable(oTable);
                this._oCustomerVHDialog.getTable().setModel(this.getView().getModel());

                this._oCustomerVHTable = oTable;
                this._oCustomerVHSearchField = oSearchField;

                this._oCustomerVHDialog.setContentWidth("650px");
                this._oCustomerVHDialog.setContentHeight("650px");

                this.getView().addDependent(this._oCustomerVHDialog);
            }

            this._oCustomerVHSearchField.setValue("");
            var oBinding = this._oCustomerVHTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
                oBinding.sort(null);
                oBinding.refresh();
            }

            this._oCustomerVHTable.setGrowing(true);
            this._oCustomerVHDialog.open();
        },

        _onCustomerSearch: function (oEvent) {
            var sValue = oEvent.getParameter("query") || oEvent.getParameter("newValue");

            if (!this._oCustomerVHTable) return;

            var oBinding = this._oCustomerVHTable.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];

            if (sValue && sValue.trim() !== "") {
                var oFilterKunnr = new Filter({
                    path: "KUNNR",
                    operator: FilterOperator.EQ,
                    value1: sValue
                });

                var oFilterName = new Filter({
                    path: "NAME1",
                    operator: FilterOperator.Contains,
                    value1: sValue
                });

                aFilters = new Filter({
                    filters: [oFilterKunnr, oFilterName],
                    and: false
                });

                oBinding.filter(aFilters);
                this._oCustomerVHTable.setGrowing(false);
            } else {
                oBinding.filter([]);
                this._oCustomerVHTable.setGrowing(true);
            }
        },

        _onCustomerDialogOk: function (oEvt) {
            var aTokens = oEvt.getParameter("tokens");
            if (!aTokens || aTokens.length === 0) {
                return;
            }

            var sKunnrRaw = aTokens[0].getKey();
            var sDisplay = aTokens[0].getText();
            var sKunnrClean = sKunnrRaw.replace(/^0+/, '') || "0";

            // Set the customer ID immediately
            this.byId("idCustomer").setValue(sKunnrClean);
            this.byId("idCustomerName").setText("Loading...");

            // Show the contacts section
            this.byId("idCustomerContacts").setVisible(true);

            // Fetch customer details using entity set with filter
            this._fetchCustomerDetails(sKunnrRaw);

            this.byId("idEquipment").setValue("");
            this.byId("idEquipmentDescription").setText("No equipment selected");
            this.byId("idVINSearch").setValue("");
            this.byId("idVINDescription").setText("Search by VIN number");

            this.byId("idSearchMode").setSelectedKey("customer");

            this._loadCustomerEquipment(sKunnrClean);

            if (this._oCustomerVHDialog) {
                this._oCustomerVHDialog.close();
            }
        },

        _fetchCustomerDetails: function (sKunnrRaw) {
            var oModel = this.getView().getModel();
            var sPath = "/CustomerSet";
            var aFilters = [
                new Filter("KUNNR", FilterOperator.EQ, sKunnrRaw)
            ];

            sap.ui.core.BusyIndicator.show(0);

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();

                    if (oData.results && oData.results.length > 0) {
                        var oCustomerData = oData.results[0];
                        this._updateCustomerContactDisplay(oCustomerData);
                    } else {
                        // If no data found, show placeholder
                        this.byId("idCustomerName").setText("Customer data not found");
                        this._showDefaultContactPlaceholders();
                    }
                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    this.byId("idCustomerName").setText("Error loading customer data");
                    this._showDefaultContactPlaceholders();
                }.bind(this)
            });
        },

        _showDefaultContactPlaceholders: function () {
            var oEmailsContainer = this.byId("idEmailsContainer");
            oEmailsContainer.removeAllItems();

            var oPhonesContainer = this.byId("idPhonesContainer");
            oPhonesContainer.removeAllItems();

            // Show the contacts section even if empty
            this.byId("idCustomerContacts").setVisible(true);
        },


        onAddMobileNumber: function () {
            var sKunnr = this.byId("idCustomer").getValue();
            if (!sKunnr) {
                MessageToast.show("Please select a customer first");
                return;
            }

            if (!this._oAddMobileDialog) {
                this._oAddMobileDialog = new sap.m.Dialog({
                    title: "Add New Mobile Number",
                    type: "Message",
                    resizable: true,
                    draggable: true,
                    contentWidth: "420px",
                    content: [
                        new sap.m.VBox({
                            items: [
                                new sap.m.Label({
                                    text: "Mobile Number",
                                    required: true,
                                    labelFor: this.createId("inpNewMobile")
                                }),
                                new sap.m.Input({
                                    id: this.createId("inpNewMobile"),
                                    type: "Tel",
                                    placeholder: "e.g. 9579411271",
                                    liveChange: function (oEvent) {
                                        var sVal = oEvent.getParameter("value").replace(/[^0-9+]/g, '');
                                        oEvent.getSource().setValue(sVal);
                                    }
                                }),
                                new sap.m.Label({
                                    text: "Extension (optional)",
                                    labelFor: this.createId("inpExt")
                                }),
                                new sap.m.Input({
                                    id: this.createId("inpExt"),
                                    placeholder: "e.g. 123",
                                    type: "Number"
                                }),
                                new sap.m.CheckBox({
                                    id: this.createId("chkSetDefault"),
                                    text: "Set as default telephone number",
                                    selected: false
                                })
                            ]
                        }).addStyleClass("sapUiSmallMargin")
                    ],
                    beginButton: new sap.m.Button({
                        text: "Add",
                        type: "Emphasized",
                        press: this._onConfirmAddMobile.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () {
                            this._oAddMobileDialog.close();
                        }.bind(this)
                    }),
                    afterClose: function () {
                        sap.ui.getCore().byId(this.createId("inpNewMobile")).setValue("");
                        sap.ui.getCore().byId(this.createId("inpExt")).setValue("");
                        sap.ui.getCore().byId(this.createId("chkSetDefault")).setSelected(false);
                    }.bind(this)
                });

                this.getView().addDependent(this._oAddMobileDialog);
            }

            this._oAddMobileDialog.open();
        },

        onAddEmail: function () {
            var sKunnr = this.byId("idCustomer").getValue();
            if (!sKunnr) {
                MessageToast.show("Please select a customer first");
                return;
            }

            if (!this._oAddEmailDialog) {
                this._oAddEmailDialog = new sap.m.Dialog({
                    title: "Add/Update Email",
                    type: "Message",
                    resizable: true,
                    draggable: true,
                    contentWidth: "420px",
                    content: [
                        new sap.m.VBox({
                            items: [
                                new sap.m.Label({
                                    text: "Email Address",
                                    required: true,
                                    labelFor: this.createId("inpNewEmail")
                                }),
                                new sap.m.Input({
                                    id: this.createId("inpNewEmail"),
                                    type: "Email",
                                    placeholder: "e.g. customer@example.com",
                                    liveChange: function (oEvent) {
                                        var sVal = oEvent.getParameter("value");
                                        // Basic email validation
                                        if (sVal && !sVal.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                                            oEvent.getSource().setValueState("Error");
                                            oEvent.getSource().setValueStateText("Please enter a valid email address");
                                        } else {
                                            oEvent.getSource().setValueState("None");
                                        }
                                    }
                                }),

                                new sap.m.CheckBox({
                                    id: this.createId("chkSetEmailDefault"),
                                    text: "Set as default email address",
                                    selected: false
                                })
                            ]
                        }).addStyleClass("sapUiSmallMargin")
                    ],

                    beginButton: new sap.m.Button({
                        text: "Update",
                        type: "Emphasized",
                        press: this._onConfirmUpdateEmail.bind(this)
                    }),

                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () {
                            this._oAddEmailDialog.close();
                        }.bind(this)
                    }),

                    afterClose: function () {
                        // Clean up inputs
                        sap.ui.getCore().byId(this.createId("inpNewEmail")).setValue("");
                        sap.ui.getCore().byId(this.createId("chkSetEmailDefault")).setSelected(false);
                        sap.ui.getCore().byId(this.createId("inpNewEmail")).setValueState("None");
                    }.bind(this)
                });

                this.getView().addDependent(this._oAddEmailDialog);
            }

            this._oAddEmailDialog.open();
        },

        _onConfirmUpdateEmail: function () {
            var sEmail = sap.ui.getCore().byId(this.createId("inpNewEmail")).getValue().trim();
            var bDefault = sap.ui.getCore().byId(this.createId("chkSetEmailDefault")).getSelected();

            // Email validation
            if (!sEmail) {
                MessageBox.error("Please enter an email address");
                return;
            }

            // Basic email format validation
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(sEmail)) {
                MessageBox.error("Please enter a valid email address (e.g., customer@example.com)");
                return;
            }

            var oModel = this.getView().getModel();
            var sKunnrClean = this.byId("idCustomer").getValue();

            var sPartnerInternal = sKunnrClean.padStart(10, "0");

            var mParameters = {
                PARTNER: sPartnerInternal,
                EMAIL: sEmail
            };

            sap.ui.core.BusyIndicator.show(0);

            oModel.callFunction("/UpdateEmail", {
                method: "POST",
                urlParameters: mParameters,

                success: function (oData, oResponse) {
                    sap.ui.core.BusyIndicator.hide();

                    var sMsg = oData?.message || "Email updated successfully";
                    MessageToast.show(sMsg);

                    this._oAddEmailDialog.close();

                    // Refresh customer data to show the updated email
                    this._refreshCustomerData(sKunnrClean);

                }.bind(this),

                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();

                    var sMsg = "Failed to update email";
                    if (oError.responseText) {
                        try {
                            var oJson = JSON.parse(oError.responseText);
                            sMsg += ": " + (oJson.error?.message?.value || oJson.error?.innererror?.errordetails?.[0]?.message || "");
                        } catch (e) { }
                    }

                    MessageBox.error(sMsg);
                }
            });
        },

        _onConfirmAddMobile: function () {
            var sMobile = sap.ui.getCore().byId(this.createId("inpNewMobile")).getValue().trim();
            var sExt = sap.ui.getCore().byId(this.createId("inpExt")).getValue().trim();
            var bDefault = sap.ui.getCore().byId(this.createId("chkSetDefault")).getSelected();

            if (!sMobile || sMobile.length < 7) {
                MessageBox.error("Please enter a valid mobile number (at least 7 digits)");
                return;
            }

            var oModel = this.getView().getModel();
            var sKunnrClean = this.byId("idCustomer").getValue();

            var sAddrNumber = "0000000123";
            var sPartnerInternal = sKunnrClean.padStart(10, "0");

            var mParameters = {
                Partner: sPartnerInternal,
                Addrnumber: sAddrNumber,
                TelNumber: sMobile,
                TelExtens: sExt || "",
                SetAsDefault: bDefault
            };

            sap.ui.core.BusyIndicator.show(0);

            oModel.callFunction("/AddMobileNumber", {
                method: "POST",
                urlParameters: mParameters,
                success: function (oData, oResponse) {
                    sap.ui.core.BusyIndicator.hide();
                    var sMsg = oData?.message || "Mobile number added successfully";
                    MessageToast.show(sMsg);
                    this._oAddMobileDialog.close();
                    this._refreshCustomerData(sKunnrClean);
                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    var sMsg = "Failed to add mobile number";
                    if (oError.responseText) {
                        try {
                            var oJson = JSON.parse(oError.responseText);
                            sMsg += ": " + (oJson.error?.message?.value || oJson.error?.innererror?.errordetails?.[0]?.message || "");
                        } catch (e) { }
                    }
                    MessageBox.error(sMsg);
                }
            });
        },

        _refreshCustomerData: function (sCustomer) {
            var oModel = this.getView().getModel();
            var sPath = "/CustomerSet";

            var sKunnrWithZeros = sCustomer.padStart(10, "0");
            var aFilters = [
                new Filter("KUNNR", FilterOperator.EQ, sKunnrWithZeros)
            ];

            sap.ui.core.BusyIndicator.show(0);

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();

                    if (oData.results && oData.results.length > 0) {
                        var oCustomerData = oData.results[0];
                        this._updateCustomerContactDisplay(oCustomerData);
                    } else {
                        MessageToast.show("Customer data not found after refresh");
                    }
                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    MessageToast.show("Could not refresh customer data");
                }
            });
        },

        _updateCustomerContactDisplay: function (oCustomerData) {
            if (!oCustomerData) return;

            var sKunnrRaw = oCustomerData.KUNNR || "";
            var sKunnrClean = sKunnrRaw.replace(/^0+/, '') || "0";
            var sName = oCustomerData.NAME1 || "No customer name";

            this.byId("idCustomerName").setText(sName);

            var oEmailsContainer = this.byId("idEmailsContainer");
            oEmailsContainer.removeAllItems();

            var aEmails = (oCustomerData.EMAILS || "No email available")
                .split(';')
                .map(s => s.trim())
                .filter(Boolean);

            aEmails.forEach(function (sEmail) {
                oEmailsContainer.addItem(new sap.m.Link({
                    text: sEmail,
                    href: "mailto:" + sEmail,
                    target: "_blank",
                    wrapping: true,
                    class: "sapUiTinyMarginEnd sapUiTinyMarginBottom email-pill"
                }));
            });

            var oPhonesContainer = this.byId("idPhonesContainer");
            oPhonesContainer.removeAllItems();

            var sRaw = oCustomerData.TELEPHONES || "No telephone available";

            var aParts = sRaw.split(';')
                .map(part => part.trim())
                .filter(part => part.length > 0);

            var aDisplayParts = [];
            aParts.forEach(function (part, index) {
                var trimmed = part.trim();
                if (trimmed.includes("(Default)") && !/\s\(Default\)/.test(trimmed)) {
                    trimmed = trimmed.replace("(Default)", " (Default)");
                }
                aDisplayParts.push(trimmed);
            });

            var aUniqueDisplay = [];
            var seenDigits = new Set();

            aDisplayParts.forEach(function (displayText) {
                var digitsOnly = displayText.replace(/[^0-9+]/g, '');
                if (digitsOnly.length >= 7 && !seenDigits.has(digitsOnly)) {
                    seenDigits.add(digitsOnly);
                    aUniqueDisplay.push(displayText);
                }
            });

            aUniqueDisplay.forEach(function (sDisplay, index) {
                var sClean = sDisplay
                    .replace(/\s+/g, '')
                    .replace(/\(Default\)/gi, '')
                    .replace(/[^0-9+]/g, '');

                var isDefault = /\(default\)/i.test(sDisplay);

                var oLink = new sap.m.Link({
                    text: sDisplay,
                    href: sClean ? "tel:" + sClean : null,
                    target: "_blank",
                    wrapping: true,
                    emphasized: isDefault,
                    class: "phone-pill"
                });

                if (isDefault) {
                    oLink.addStyleClass("default-pill");
                }

                oPhonesContainer.addItem(oLink);
            });

            var bHasPhones = aUniqueDisplay.length > 0 && aUniqueDisplay[0] !== "No telephone available";
            this.byId("idCustomerContacts").setVisible(bHasPhones || aEmails.length > 0);
        },

        onCustomerChange: function (oEvent) {
            var sValue = oEvent.getSource().getValue();
            if (!sValue) {
                var oTableModel = this.getView().getModel("table");
                oTableModel.setProperty("/equipmentItems", []);
                this.byId("idCustomerContacts").setVisible(false);
                this.byId("idEmailsContainer").removeAllItems();
                this.byId("idPhonesContainer").removeAllItems();
                this._updateUIState();
            }
        },

        onEquipmentValueHelp: function (oEvent) {
            this._showEquipmentDialog();
        },

        _showEquipmentDialog: function () {
            if (!this._oEquipmentVHDialog) {
                var oSearchField = new sap.m.SearchField({
                    placeholder: "Search Equipment or Description...",
                    search: this._onEquipmentSearch.bind(this),
                    liveChange: this._onEquipmentSearch.bind(this)
                });

                this._oEquipmentVHDialog = new ValueHelpDialog({
                    title: "Select Equipment",
                    supportMultiselect: false,
                    supportRanges: false,
                    key: "EQUNR",
                    descriptionKey: "EQKTX",
                    ok: this._onEquipmentDialogOk.bind(this),
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
                        "$orderby": "EQUNR asc"
                    },
                    template: oTemplate
                });

                this._oEquipmentVHDialog.setTable(oTable);
                this._oEquipmentVHDialog.getTable().setModel(this.getView().getModel());

                this._oEquipmentVHTable = oTable;
                this._oEquipmentVHSearchField = oSearchField;

                this._oEquipmentVHDialog.setContentWidth("650px");
                this._oEquipmentVHDialog.setContentHeight("650px");

                this.getView().addDependent(this._oEquipmentVHDialog);
            }

            this._oEquipmentVHSearchField.setValue("");
            var oBinding = this._oEquipmentVHTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
                oBinding.sort(null);
                oBinding.refresh();
            }

            this._oEquipmentVHTable.setGrowing(true);
            this._oEquipmentVHDialog.open();
        },

        _onEquipmentSearch: function (oEvent) {
            var sValue = oEvent.getParameter("query") || oEvent.getParameter("newValue");

            if (!this._oEquipmentVHTable) return;

            var oBinding = this._oEquipmentVHTable.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];

            if (sValue && sValue.trim() !== "") {
                var oFilter1 = new Filter({
                    path: "EQUNR",
                    operator: FilterOperator.EQ,
                    value1: sValue
                });

                var oFilter2 = new Filter({
                    path: "EQKTX",
                    operator: FilterOperator.Contains,
                    value1: sValue
                });

                aFilters = new Filter({
                    filters: [oFilter1, oFilter2],
                    and: false
                });

                oBinding.filter(aFilters);
                this._oEquipmentVHTable.setGrowing(false);
            } else {
                oBinding.filter([]);
                this._oEquipmentVHTable.setGrowing(true);
            }
        },

        _onEquipmentDialogOk: function (oEvt) {
            var aTokens = oEvt.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                var sEqunr = aTokens[0].getKey();
                var sFullText = aTokens[0].getText();
                var sEqunrClean = sEqunr.replace(/^0+/, '') || "0";
                var sDescription = this._extractDescription(sFullText, sEqunr);

                this.byId("idEquipment").setValue(sEqunrClean);
                this.byId("idEquipmentDescription").setText(sDescription || "No description available");

                this.byId("idCustomer").setValue("");
                this.byId("idCustomerName").setText("No customer selected");
                this.byId("idVINSearch").setValue("");
                this.byId("idVINDescription").setText("Search by VIN number");

                this.byId("idSearchMode").setSelectedKey("equipment");

                this._loadSingleEquipment(sEqunrClean);
            }

            if (this._oEquipmentVHDialog) {
                this._oEquipmentVHDialog.close();
            }
        },

        onEquipmentChange: function (oEvent) {
            var sValue = oEvent.getSource().getValue();
            if (!sValue) {
                var oTableModel = this.getView().getModel("table");
                oTableModel.setProperty("/equipmentItems", []);
                this._updateUIState();
            }
        },

        onVINValueHelp: function (oEvent) {
            this._showVINDialog();
        },

        _showVINDialog: function () {
            if (!this._oVINVHDialog) {
                var oSearchField = new sap.m.SearchField({
                    placeholder: "Search VIN Number...",
                    search: this._onVINSearch.bind(this),
                    liveChange: this._onVINSearch.bind(this)
                });

                this._oVINVHDialog = new ValueHelpDialog({
                    title: "Search by VIN Number",
                    supportMultiselect: false,
                    supportRanges: false,
                    key: "FLEET_VIN",
                    descriptionKey: "FLEET_VIN",
                    ok: this._onVINDialogOk.bind(this),
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
                        new sap.m.Column({ header: new sap.m.Text({ text: "VIN Number" }), width: "100%" })
                    ]
                });

                var oTemplate = new sap.m.ColumnListItem({
                    type: "Active",
                    cells: [
                        new sap.m.Text({ text: "{FLEET_VIN}" })
                    ]
                });

                oTable.bindItems({
                    path: "/FleetSet",
                    parameters: {
                        "$select": "FLEET_VIN",
                        "$orderby": "FLEET_VIN asc",
                        "$filter": "FLEET_VIN ne ''"
                    },
                    template: oTemplate
                });

                this._oVINVHDialog.setTable(oTable);
                this._oVINVHDialog.getTable().setModel(this.getView().getModel());

                this._oVINVHTable = oTable;
                this._oVINVHSearchField = oSearchField;

                this._oVINVHDialog.setContentWidth("500px");
                this._oVINVHDialog.setContentHeight("500px");

                this.getView().addDependent(this._oVINVHDialog);
            }

            this._oVINVHSearchField.setValue("");
            var oBinding = this._oVINVHTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
                oBinding.sort(null);
                oBinding.refresh();
            }

            this._oVINVHTable.setGrowing(true);
            this._oVINVHDialog.open();
        },

        _onVINSearch: function (oEvent) {
            var sValue = oEvent.getParameter("query") || oEvent.getParameter("newValue");

            if (!this._oVINVHTable) return;

            var oBinding = this._oVINVHTable.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];

            if (sValue && sValue.trim() !== "") {
                var oFilter = new Filter({
                    path: "FLEET_VIN",
                    operator: FilterOperator.Contains,
                    value1: sValue
                });

                oBinding.filter([oFilter]);
                this._oVINVHTable.setGrowing(false);
            } else {
                oBinding.filter([]);
                this._oVINVHTable.setGrowing(true);
            }
        },

        _onVINDialogOk: function (oEvt) {
            var aTokens = oEvt.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                var sVIN = aTokens[0].getKey();

                this.byId("idVINSearch").setValue(sVIN);
                this.byId("idVINDescription").setText("VIN: " + sVIN);

                this.byId("idCustomer").setValue("");
                this.byId("idCustomerName").setText("No customer selected");
                this.byId("idEquipment").setValue("");
                this.byId("idEquipmentDescription").setText("No equipment selected");

                this.byId("idSearchMode").setSelectedKey("vin");

                this._loadEquipmentByVIN(sVIN);
            }

            if (this._oVINVHDialog) {
                this._oVINVHDialog.close();
            }
        },

        onVINChange: function (oEvent) {
            var sValue = oEvent.getSource().getValue();
            if (!sValue) {
                var oTableModel = this.getView().getModel("table");
                oTableModel.setProperty("/equipmentItems", []);
                this._updateUIState();
            }
        },

        _loadCustomerEquipment: function (sCustomer) {
            sap.ui.core.BusyIndicator.show(0);

            var oModel = this.getView().getModel();
            var sPath = "/CustomerEquipmentSet";
            var aFilters = [
                new Filter("KUNNR", FilterOperator.EQ, sCustomer)
            ];

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();

                    var aEquipmentItems = [];
                    var oTableModel = this.getView().getModel("table");

                    if (oData.results && oData.results.length > 0) {
                        oData.results.forEach(function (oItem) {
                            var sOriginalEqunr = oItem.EQUNR || "";
                            var sDisplayEqunr = sOriginalEqunr.replace(/^0+/, '') || "0";

                            aEquipmentItems.push({
                                equnr: sDisplayEqunr,
                                originalEqunr: sOriginalEqunr,
                                eqktx: oItem.EQKTX || "No description",
                                name1: oItem.NAME1 || "",
                                fleetVin: oItem.FLEET_VIN || "",
                                chassisNum: oItem.CHASSIS_NUM || "",
                                licenseNum: oItem.LICENSE_NUM || "",
                                objnr: oItem.Objnr || "",
                                originalLicenseNum: oItem.LICENSE_NUM || "",
                                hasChanged: false,
                                editable: true,
                                selected: false
                            });
                        });

                        this._showStatusMessage("Loaded " + aEquipmentItems.length + " equipment(s) for customer", "Success");
                    } else {
                        this._showStatusMessage("No equipment found for this customer", "Information");
                    }

                    oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                    oTableModel.setProperty("/changedItems", []);
                    oTableModel.setProperty("/selectedEquipment", null);

                    this._updateUIState();

                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    this._showStatusMessage("Error loading equipment data", "Error");
                    var oTableModel = this.getView().getModel("table");
                    oTableModel.setProperty("/equipmentItems", []);
                    oTableModel.setProperty("/changedItems", []);
                    this._updateUIState();
                }.bind(this)
            });
        },

        _loadSingleEquipment: function (sEquipment) {
            sap.ui.core.BusyIndicator.show(0);

            var oModel = this.getView().getModel();
            var sEquipmentPath = "/EquipmentSet('" + sEquipment + "')";

            oModel.read(sEquipmentPath, {
                success: function (oEquipData) {
                    if (!oEquipData) {
                        sap.ui.core.BusyIndicator.hide();
                        this._showStatusMessage("Equipment not found", "Error");
                        return;
                    }

                    var sFleetPath = "/FleetSet('" + sEquipment + "')";

                    oModel.read(sFleetPath, {
                        success: function (oFleetData) {
                            sap.ui.core.BusyIndicator.hide();

                            var aEquipmentItems = [];
                            var oTableModel = this.getView().getModel("table");

                            var sOriginalEqunr = oEquipData.EQUNR || sEquipment;
                            var sDisplayEqunr = sOriginalEqunr.replace(/^0+/, '') || "0";

                            this._getCustomerForEquipment(sEquipment, function (sCustomerName) {
                                var oItem = {
                                    equnr: sDisplayEqunr,
                                    originalEqunr: sOriginalEqunr,
                                    eqktx: oEquipData.EQKTX || "No description",
                                    name1: sCustomerName || "",
                                    fleetVin: oFleetData ? oFleetData.FLEET_VIN || "" : "",
                                    chassisNum: oFleetData ? oFleetData.CHASSIS_NUM || "" : "",
                                    licenseNum: oFleetData ? oFleetData.LICENSE_NUM || "" : "",
                                    objnr: oEquipData.OBJNR || "",
                                    originalLicenseNum: oFleetData ? oFleetData.LICENSE_NUM || "" : "",
                                    hasChanged: false,
                                    editable: true,
                                    selected: false
                                };

                                aEquipmentItems.push(oItem);

                                oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                                oTableModel.setProperty("/changedItems", []);
                                oTableModel.setProperty("/selectedEquipment", null);

                                this._updateUIState();
                                this._showStatusMessage("Loaded equipment " + sDisplayEqunr, "Success");

                            }.bind(this));

                        }.bind(this),
                        error: function (oError) {
                            sap.ui.core.BusyIndicator.hide();
                            var aEquipmentItems = [];
                            var oTableModel = this.getView().getModel("table");

                            var sOriginalEqunr = oEquipData.EQUNR || sEquipment;
                            var sDisplayEqunr = sOriginalEqunr.replace(/^0+/, '') || "0";

                            this._getCustomerForEquipment(sEquipment, function (sCustomerName) {
                                var oItem = {
                                    equnr: sDisplayEqunr,
                                    originalEqunr: sOriginalEqunr,
                                    eqktx: oEquipData.EQKTX || "No description",
                                    name1: sCustomerName || "",
                                    fleetVin: "",
                                    chassisNum: "",
                                    licenseNum: "",
                                    objnr: oEquipData.OBJNR || "",
                                    originalLicenseNum: "",
                                    hasChanged: false,
                                    editable: true,
                                    selected: false
                                };

                                aEquipmentItems.push(oItem);

                                oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                                oTableModel.setProperty("/changedItems", []);
                                oTableModel.setProperty("/selectedEquipment", null);

                                this._updateUIState();
                                this._showStatusMessage("Loaded equipment (no fleet data found)", "Warning");
                            }.bind(this));
                        }.bind(this)
                    });

                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    this._showStatusMessage("Error loading equipment data", "Error");
                    var oTableModel = this.getView().getModel("table");
                    oTableModel.setProperty("/equipmentItems", []);
                    oTableModel.setProperty("/changedItems", []);
                    this._updateUIState();
                }.bind(this)
            });
        },

        _loadEquipmentByVIN: function (sVIN) {
            sap.ui.core.BusyIndicator.show(0);

            var oModel = this.getView().getModel();
            var sPath = "/FleetSet";
            var aFilters = [
                new Filter("FLEET_VIN", FilterOperator.EQ, sVIN)
            ];

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();

                    var aEquipmentItems = [];
                    var oTableModel = this.getView().getModel("table");

                    if (oData.results && oData.results.length > 0) {
                        oData.results.forEach(function (oItem) {
                            var sOriginalEqunr = oItem.EQUNR || "";
                            var sDisplayEqunr = sOriginalEqunr.replace(/^0+/, '') || "0";

                            this._getEquipmentDetailsForVIN(sOriginalEqunr, sVIN, function (oDetails) {
                                aEquipmentItems.push({
                                    equnr: sDisplayEqunr,
                                    originalEqunr: sOriginalEqunr,
                                    eqktx: oDetails.EQKTX || "No description",
                                    name1: oDetails.NAME1 || "",
                                    fleetVin: oItem.FLEET_VIN || "",
                                    chassisNum: oItem.CHASSIS_NUM || "",
                                    licenseNum: oItem.LICENSE_NUM || "",
                                    objnr: oItem.OBJNR || "",
                                    originalLicenseNum: oItem.LICENSE_NUM || "",
                                    hasChanged: false,
                                    editable: true,
                                    selected: false
                                });

                                oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                                oTableModel.setProperty("/changedItems", []);
                                oTableModel.setProperty("/selectedEquipment", null);

                                this._updateUIState();
                                this._showStatusMessage("Found equipment for VIN: " + sVIN, "Success");
                            }.bind(this));
                        }.bind(this));
                    } else {
                        this._searchVINInCustomerEquipment(sVIN);
                        return;
                    }

                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    this._searchVINInCustomerEquipment(sVIN);
                }.bind(this)
            });
        },

        _getEquipmentDetailsForVIN: function (sEquipment, sVIN, fCallback) {
            var oModel = this.getView().getModel();
            var sPath = "/CustomerEquipmentSet";
            var aFilters = [
                new Filter("EQUNR", FilterOperator.EQ, sEquipment)
            ];

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    var oDetails = {
                        EQKTX: "",
                        NAME1: ""
                    };

                    if (oData.results && oData.results.length > 0) {
                        oDetails.EQKTX = oData.results[0].EQKTX || "";
                        oDetails.NAME1 = oData.results[0].NAME1 || "";
                    } else {
                        var sEquipmentPath = "/EquipmentSet('" + sEquipment + "')";
                        oModel.read(sEquipmentPath, {
                            success: function (oEquipData) {
                                oDetails.EQKTX = oEquipData.EQKTX || "";
                                fCallback(oDetails);
                            },
                            error: function () {
                                fCallback(oDetails);
                            }
                        });
                        return;
                    }

                    fCallback(oDetails);
                }.bind(this),
                error: function () {
                    fCallback({ EQKTX: "", NAME1: "" });
                }.bind(this)
            });
        },

        _searchVINInCustomerEquipment: function (sVIN) {
            var oModel = this.getView().getModel();
            var sPath = "/CustomerEquipmentSet";
            var aFilters = [
                new Filter("FleetVin", FilterOperator.EQ, sVIN)
            ];

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    var aEquipmentItems = [];
                    var oTableModel = this.getView().getModel("table");

                    if (oData.results && oData.results.length > 0) {
                        oData.results.forEach(function (oItem) {
                            var sOriginalEqunr = oItem.Equnr || "";
                            var sDisplayEqunr = sOriginalEqunr.replace(/^0+/, '') || "0";

                            aEquipmentItems.push({
                                equnr: sDisplayEqunr,
                                originalEqunr: sOriginalEqunr,
                                eqktx: oItem.Eqktx || "No description",
                                name1: oItem.Name1 || "",
                                fleetVin: oItem.FleetVin || "",
                                chassisNum: oItem.ChassisNum || "",
                                licenseNum: oItem.LicenseNum || "",
                                objnr: oItem.Objnr || "",
                                originalLicenseNum: oItem.LicenseNum || "",
                                hasChanged: false,
                                editable: true,
                                selected: false
                            });
                        });

                        this._showStatusMessage("Found " + aEquipmentItems.length + " equipment(s) for VIN: " + sVIN, "Success");
                    } else {
                        this._showStatusMessage("No equipment found for VIN: " + sVIN, "Information");
                    }

                    oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                    oTableModel.setProperty("/changedItems", []);
                    oTableModel.setProperty("/selectedEquipment", null);

                    this._updateUIState();

                }.bind(this),
                error: function (oError) {
                    this._showStatusMessage("Error searching for VIN: " + sVIN, "Error");
                    var oTableModel = this.getView().getModel("table");
                    oTableModel.setProperty("/equipmentItems", []);
                    oTableModel.setProperty("/changedItems", []);
                    this._updateUIState();
                }.bind(this)
            });
        },

        _getCustomerForEquipment: function (sEquipment, fCallback) {
            var oModel = this.getView().getModel();
            var sPath = "/CustomerEquipmentSet";
            var aFilters = [
                new Filter("EQUNR", FilterOperator.EQ, sEquipment)
            ];

            oModel.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    var sCustomerName = "";
                    if (oData.results && oData.results.length > 0) {
                        sCustomerName = oData.results[0].Name1 || "";
                    }
                    fCallback(sCustomerName);
                }.bind(this),
                error: function () {
                    fCallback("");
                }.bind(this)
            });
        },

        onTableItemPress: function (oEvent) {
            var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            var oContext = oItem.getBindingContext("table");
            if (oContext) {
                var oData = oContext.getObject();
                var oTableModel = this.getView().getModel("table");
                oTableModel.setProperty("/selectedEquipment", oData.equnr);
                var oFormModel = this.getView().getModel("form");
                oFormModel.setProperty("/selectedItem", oData);
                this.byId("idUpdateButton").setEnabled(true);
            }
        },

        onPlateNumberChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sNewValue = oInput.getValue();
            var oContext = oInput.getBindingContext("table");

            if (oContext) {
                var oData = oContext.getObject();
                var oTableModel = this.getView().getModel("table");
                var sPath = oContext.getPath();

                if (sNewValue !== oData.originalLicenseNum) {
                    oTableModel.setProperty(sPath + "/licenseNum", sNewValue);
                    oTableModel.setProperty(sPath + "/hasChanged", true);

                    var aChangedItems = oTableModel.getProperty("/changedItems") || [];
                    var oChangedItem = aChangedItems.find(function (item) {
                        return item.equnr === oData.equnr;
                    });

                    if (!oChangedItem) {
                        aChangedItems.push({
                            equnr: oData.equnr,
                            licenseNum: sNewValue,
                            objnr: oData.objnr
                        });
                    } else {
                        oChangedItem.licenseNum = sNewValue;
                    }

                    oTableModel.setProperty("/changedItems", aChangedItems);
                    this._updateUIState();
                    MessageToast.show("Plate number updated for " + oData.equnr);
                }
            }
        },

        onSearchModeChange: function (oEvent) {
            var sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/searchMode", sSelectedKey);

            this.byId("idCustomer").setValue("");
            this.byId("idCustomerName").setText("No customer selected");
            this.byId("idEquipment").setValue("");
            this.byId("idEquipmentDescription").setText("No equipment selected");
            this.byId("idVINSearch").setValue("");
            this.byId("idVINDescription").setText("Search by VIN number");

            this.byId("idCustomerContacts").setVisible(false);
            this.byId("idEmailsContainer").removeAllItems();
            this.byId("idPhonesContainer").removeAllItems();

            var oTableModel = this.getView().getModel("table");
            oTableModel.setProperty("/equipmentItems", []);
            oTableModel.setProperty("/changedItems", []);

            this._updateUIState();

            switch (sSelectedKey) {
                case "customer":
                    this._showStatusMessage("Select a customer to view all their equipment", "Information");
                    break;
                case "equipment":
                    this._showStatusMessage("Select an equipment to view its details", "Information");
                    break;
                case "vin":
                    this._showStatusMessage("Search by VIN number to find specific vehicle", "Information");
                    break;
            }
        },

        onUpdateSelectedPress: function () {
            var oTableModel = this.getView().getModel("table");
            var sSelectedEquipment = oTableModel.getProperty("/selectedEquipment");
            var aEquipmentItems = oTableModel.getProperty("/equipmentItems");

            if (!sSelectedEquipment) {
                MessageBox.error("Please select an equipment from the table first");
                return;
            }

            var oSelectedItem = aEquipmentItems.find(function (item) {
                return item.equnr === sSelectedEquipment;
            });

            if (!oSelectedItem) {
                MessageBox.error("Selected equipment not found");
                return;
            }

            if (!oSelectedItem.licenseNum || oSelectedItem.licenseNum.trim() === "") {
                MessageBox.error("Please enter a plate number for the selected equipment");
                return;
            }

            MessageBox.confirm(
                "Update plate number for Equipment " + sSelectedEquipment +
                "?\n\nNew Plate Number: " + oSelectedItem.licenseNum,
                {
                    title: "Confirm Update",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            this._updateSingleEquipment(oSelectedItem);
                        }
                    }.bind(this)
                }
            );
        },

        _updateSingleEquipment: function (oEquipment) {
            sap.ui.core.BusyIndicator.show(0);

            var oModel = this.getView().getModel();
            var sPath = "/FleetSet('" + (oEquipment.originalEqunr || oEquipment.equnr) + "')";
            var oPayload = {
                EQUNR: oEquipment.originalEqunr || oEquipment.equnr,
                LICENSE_NUM: oEquipment.licenseNum
            };

            oModel.update(sPath, oPayload, {
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();

                    var oTableModel = this.getView().getModel("table");
                    var aEquipmentItems = oTableModel.getProperty("/equipmentItems");

                    aEquipmentItems.forEach(function (item) {
                        if (item.equnr === oEquipment.equnr) {
                            item.originalLicenseNum = oEquipment.licenseNum;
                            item.hasChanged = false;
                        }
                    });

                    var aChangedItems = oTableModel.getProperty("/changedItems") || [];
                    aChangedItems = aChangedItems.filter(function (item) {
                        return item.equnr !== oEquipment.equnr;
                    });

                    oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                    oTableModel.setProperty("/changedItems", aChangedItems);

                    this._updateUIState();
                    this._showStatusMessage("Updated plate number for " + oEquipment.equnr, "Success");

                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    this._showStatusMessage("Update failed for " + oEquipment.equnr, "Error");
                }.bind(this),
                merge: false
            });
        },

        onBatchUpdatePress: function () {
            var oTableModel = this.getView().getModel("table");
            var aChangedItems = oTableModel.getProperty("/changedItems") || [];

            if (aChangedItems.length === 0) {
                MessageBox.error("No changes to update");
                return;
            }

            var sMessage = "Update " + aChangedItems.length + " plate number(s)?\n\n";
            aChangedItems.forEach(function (item, index) {
                sMessage += (index + 1) + ". Equipment " + item.equnr + ": " +
                    (item.licenseNum || "(empty)") + "\n";
            });

            MessageBox.confirm(
                sMessage,
                {
                    title: "Confirm Batch Update",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            this._batchUpdatePlateNumbersSequentially(aChangedItems);
                        }
                    }.bind(this)
                }
            );
        },

        _batchUpdatePlateNumbersSequentially: function (aChangedItems) {
            sap.ui.core.BusyIndicator.show(0);

            var iSuccessCount = 0;
            var iErrorCount = 0;
            var aErrors = [];
            var oModel = this.getView().getModel();

            this._processUpdateSequentially(aChangedItems, 0, iSuccessCount, iErrorCount, aErrors, oModel);
        },

        _processUpdateSequentially: function (aChangedItems, iIndex, iSuccessCount, iErrorCount, aErrors, oModel) {
            if (iIndex >= aChangedItems.length) {
                sap.ui.core.BusyIndicator.hide();

                var oTableModel = this.getView().getModel("table");
                var aEquipmentItems = oTableModel.getProperty("/equipmentItems");

                aEquipmentItems.forEach(function (oItem) {
                    var oChangedItem = aChangedItems.find(function (changed) {
                        return changed.equnr === oItem.equnr;
                    });

                    if (oChangedItem) {
                        oItem.originalLicenseNum = oChangedItem.licenseNum;
                        oItem.hasChanged = false;
                    }
                });

                oTableModel.setProperty("/equipmentItems", aEquipmentItems);
                oTableModel.setProperty("/changedItems", []);
                this._updateUIState();

                if (iErrorCount === 0) {
                    this._showStatusMessage("Successfully updated " + iSuccessCount + " plate number(s)", "Success");
                } else {
                    var sErrorMsg = "Updated " + iSuccessCount + " plate number(s), " +
                        iErrorCount + " failed.\n\nErrors:\n" +
                        aErrors.join("\n");

                    if (sErrorMsg.length > 500) {
                        sErrorMsg = sErrorMsg.substring(0, 500) + "...";
                    }

                    MessageBox.error(sErrorMsg, {
                        title: "Batch Update Results"
                    });
                }
                return;
            }

            var oItem = aChangedItems[iIndex];

            if (!oItem.licenseNum || oItem.licenseNum.trim() === "") {
                this._processUpdateSequentially(aChangedItems, iIndex + 1, iSuccessCount, iErrorCount, aErrors, oModel);
                return;
            }

            var oTableModel = this.getView().getModel("table");
            var aEquipmentItems = oTableModel.getProperty("/equipmentItems");
            var oEquipment = aEquipmentItems.find(function (equip) {
                return equip.equnr === oItem.equnr;
            });

            var sEqunrForUpdate = oEquipment ? (oEquipment.originalEqunr || oItem.equnr) : oItem.equnr;

            var sPath = "/FleetSet('" + sEqunrForUpdate + "')";
            var oPayload = {
                EQUNR: sEqunrForUpdate,
                LICENSE_NUM: oItem.licenseNum
            };

            oModel.update(sPath, oPayload, {
                success: function () {
                    iSuccessCount++;
                    this._processUpdateSequentially(aChangedItems, iIndex + 1, iSuccessCount, iErrorCount, aErrors, oModel);
                }.bind(this),
                error: function (oError) {
                    iErrorCount++;
                    aErrors.push("Equipment " + oItem.equnr + ": " +
                        (oError.message || "Update failed"));
                    this._processUpdateSequentially(aChangedItems, iIndex + 1, iSuccessCount, iErrorCount, aErrors, oModel);
                }.bind(this),
                merge: false
            });
        },

        _updateUIState: function () {
            var oTableModel = this.getView().getModel("table");
            var aChangedItems = oTableModel.getProperty("/changedItems") || [];
            var sSelectedEquipment = oTableModel.getProperty("/selectedEquipment");

            this.byId("idBatchUpdateButton").setEnabled(aChangedItems.length > 0);
            this.byId("idUpdateButton").setEnabled(!!sSelectedEquipment);

            var oFormModel = this.getView().getModel("form");
            oFormModel.setProperty("/hasChanges", aChangedItems.length > 0);
        },

        _showStatusMessage: function (sMessage, sType) {
            var oMessageStrip = this.byId("idStatusMessage");
            if (oMessageStrip) {
                oMessageStrip.setText(sMessage);
                oMessageStrip.setType(sType);
                oMessageStrip.setVisible(true);

                if (sType === "Success") {
                    setTimeout(function () {
                        oMessageStrip.setVisible(false);
                    }, 5000);
                }
            }
        },

        onClearFiltersPress: function () {
            this.byId("idCustomer").setValue("");
            this.byId("idCustomerName").setText("No customer selected");
            this.byId("idEquipment").setValue("");
            this.byId("idEquipmentDescription").setText("No equipment selected");
            this.byId("idVINSearch").setValue("");
            this.byId("idVINDescription").setText("Search by VIN number");

            this.byId("idCustomerContacts").setVisible(false);
            this.byId("idEmailsContainer").removeAllItems();
            this.byId("idPhonesContainer").removeAllItems();

            var oTableModel = this.getView().getModel("table");
            oTableModel.setProperty("/equipmentItems", []);
            oTableModel.setProperty("/changedItems", []);
            oTableModel.setProperty("/selectedEquipment", null);

            this._updateUIState();
            this._showStatusMessage("Filters cleared", "Information");
        },

        onRefreshPress: function () {
            var sCustomer = this.byId("idCustomer").getValue();
            var sEquipment = this.byId("idEquipment").getValue();
            var sVIN = this.byId("idVINSearch").getValue();
            var sSearchMode = this.byId("idSearchMode").getSelectedKey();

            if (sSearchMode === "customer" && sCustomer) {
                this._loadCustomerEquipment(sCustomer);
                MessageToast.show("Refreshed customer data");
            } else if (sSearchMode === "equipment" && sEquipment) {
                this._loadSingleEquipment(sEquipment);
                MessageToast.show("Refreshed equipment data");
            } else if (sSearchMode === "vin" && sVIN) {
                this._loadEquipmentByVIN(sVIN);
                MessageToast.show("Refreshed VIN search");
            } else {
                MessageBox.error("Please select a search criteria first");
            }
        },

        onClearAllPress: function () {
            MessageBox.confirm(
                "Clear all data and changes? This cannot be undone.",
                {
                    title: "Confirm Clear All",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            this.onClearFiltersPress();
                            this._showStatusMessage("All data cleared", "Success");
                        }
                    }.bind(this)
                }
            );
        },

        onSelectCustomerHelp: function () {
            this._showCustomerDialog();
        },

        onSelectEquipmentHelp: function () {
            this._showEquipmentDialog();
        },

        onSelectVINHelp: function () {
            this._showVINDialog();
        },

        formatEquipmentNoLeadingZeros: function (sValue) {
            if (!sValue) return "";
            return sValue.replace(/^0+/, '') || "0";
        },

        formatEqunrNoLeadingZeros: function (sValue) {
            if (!sValue) return "";
            return sValue.replace(/^0+/, '') || "0";
        },

        formatKunnrNoLeadingZeros: function (sValue) {
            if (!sValue) return "";
            return sValue.replace(/^0+/, '') || "0";
        },

        _extractDescription: function (sFullText, sEqunr) {
            if (!sFullText || !sEqunr) return sFullText || "";
            var sEqunrPattern = "\\s*\\(" + sEqunr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\)$";
            var sDescription = sFullText.replace(new RegExp(sEqunrPattern), "");
            return sDescription.trim() || sFullText;
        },

        _extractCustomerName: function (sFullText, sKunnr) {
            if (!sFullText || !sKunnr) return sFullText || "";
            var sKunnrPattern = "\\s*\\(" + sKunnr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\)$";
            var sCustomerName = sFullText.replace(new RegExp(sKunnrPattern), "");
            return sCustomerName.trim() || sFullText;
        }
    });
});