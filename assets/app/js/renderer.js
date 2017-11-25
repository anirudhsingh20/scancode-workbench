/*
 #
 # Copyright (c) 2017 nexB Inc. and others. All rights reserved.
 # http://nexb.com and https://github.com/nexB/aboutcode-manager/
 # The ScanCode software is licensed under the Apache License version 2.0.
 # AboutCode is a trademark of nexB Inc.
 #
 # You may not use this software except in compliance with the License.
 # You may obtain a copy of the License at: http://apache.org/licenses/LICENSE-2.0
 # Unless required by applicable law or agreed to in writing, software distributed
 # under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 # CONDITIONS OF ANY KIND, either express or implied. See the License for the
 # specific language governing permissions and limitations under the License.
 #
 */


const fs = require('fs');
const shell = require("electron").shell;

 // The electron library for opening a dialog
const dialog = require('electron').remote.dialog;

// The Electron module used to communicate asynchronously from a renderer process to the main process.
const ipcRenderer = require('electron').ipcRenderer;
const packageJson = require('../../../package.json');
const aboutCodeVersion = packageJson.version;

$(document).ready(function () {
    // Create default values for all of the data and ui classes
    let aboutCodeDB = new AboutCodeDB();
    let nodeView = new AboutCodeNodeView("#node-view", aboutCodeDB);
    let barChart = new AboutCodeBarChart("#summary-bar-chart", aboutCodeDB);
    let dashboard = new AboutCodeDashboard("#dashboard-container", aboutCodeDB);

    // These classes are only created once, otherwise DataTables will complain
    const cluesTable = new AboutCodeDataTable("#clues-table", aboutCodeDB);
    const componentsTable = new ComponentDataTable("#components-table", aboutCodeDB)
        .on('upload-clicked', components => {
            if (components.length > 0) {
                dejaCodeExportDialog().show();
            } else {
                alert("You have no Components to upload.\n\n" +
                    "Please create at least one Component and try again.");
            }
        });

    const jstree = new AboutCodeJsTree("#jstree", aboutCodeDB)
        .on('node-edit', node => componentDialog().show(node.id))
        .on("node-selected", node => {
            let barChartValue = chartAttributesSelect.val();

            // Set the search value for the first column (path) equal to the
            // Selected jstree path and redraw the table
            cluesTable.columns(0).search(node.id).draw();
            nodeView.setRoot(node.id);
            barChart.showSummary(barChartValue, node.id);
        });

    const splitter = new Splitter('#leftCol', '#tabbar')
        .on('drag-end', () => {
            if ($('#bar-chart-container').is(':visible')) {
                barChart.draw();
            }
            if ($('#clues-container').is(':visible')) {
                cluesTable.draw();
            }
        });

    // Setup css styling for sidebar button state when clicked.
    const navButtons = $("#sidebar-wrapper").find(".btn-change");
    navButtons.each((i, clickedButton) => {
        $(clickedButton).click(function() {
            navButtons.each((i, button) => {
                if (button === clickedButton) {
                    $(button).addClass("selected");
                } else {
                    $(button).removeClass("selected");
                }
            });
        });
    });

    // Defines DOM element constants for buttons.
    const showClueButton = $("#show-clue-table");
    const showNodeViewButton = $("#show-tree");
    const showComponentButton = $("#show-component-table");
    const showBarChartButton = $("#show-bar-chart");
    const showDashboardButton = $("#show-dashboard");
    const saveSQLiteFileButton = $("#save-file");
    const openSQLiteFileButton = $("#open-file");
    const resetZoomButton = $("#reset-zoom");
    const leftCol = $("#leftCol");
    const tabBar = $("#tabbar");

    // Defines DOM element constants for the main view containers.
    const nodeContainer = $("#node-container");
    const cluesContainer = $("#clues-container");
    const componentContainer = $("#component-container");
    const barChartContainer = $("#bar-chart-container");
    const dashboardContainer = $("#dashboard-container");

    const chartAttributesSelect = $("select#select-chart-attribute");
    const barChartTotalFiles = $("span.total-files");

    chartAttributesSelect.select2({
        placeholder: "Select an attribute"
    });

    // Populate bar chart summary select box values
    $.each(AboutCodeDataTable.TABLE_COLUMNS, (i, column) => {
        if (column.bar_chart_class) {
            chartAttributesSelect.append(`<option class="${column.bar_chart_class}" value="${column.name}">${column.title}</option>`);
        }
    });

    chartAttributesSelect.on( "change", function () {
        // Get dropdown element selected value
        let val = $(this).val();
        const jstreePath = jstree.jstree("get_selected")[0];
        barChart.showSummary(val, jstreePath);
    });

    $(".bar-chart-copyrights").wrapAll(`<optgroup label="Copyright Information"/>`);
    $(".bar-chart-licenses").wrapAll(`<optgroup label="License Information"/>`);
    $(".bar-chart-emails").wrapAll(`<optgroup label="Email Information"/>`);
    $(".bar-chart-file-infos").wrapAll(`<optgroup label="File Information"/>`);
    $(".bar-chart-package-infos").wrapAll(`<optgroup label="Package Information"/>`);

    let selectedStatuses = ["Analyzed", "Attention", "Original", "NR"];

    $(".status-dropdown-menu a").on("click", (event) => {
        let target = $(event.currentTarget),
            value = target.attr("data-value"),
            input = target.find("input"),
            index;

        if ((index = selectedStatuses.indexOf(value)) > -1) {
            selectedStatuses.splice(index, 1);
            // setTimeout is needed for checkbox to show up
            setTimeout(() =>  input.prop("checked", false), 0);
        } else {
            selectedStatuses.push(value);
            setTimeout(() => input.prop("checked", true), 0);
        }
        $(event.target).blur();

        nodeView.setIsNodePruned((node) => {
            return selectedStatuses.indexOf(node.review_status) < 0 &&
                node.review_status !== "";
        });

        nodeView.redraw();
        return false;
    });

    function componentDialog() {
        return new ComponentDialog("#nodeModal", aboutCodeDB)
            .on('save', component => {
                nodeView.nodeData[component.path].component = component;
                nodeView.redraw();
            })
            .on('delete', component => {
                nodeView.nodeData[component.path].component = null;
                nodeView.redraw();
            });
    }

    function dejaCodeExportDialog() {
        return new DejaCodeExportDialog("#componentExportModal", aboutCodeDB);
    }

    // Resize the nodes based on how many clues are selected
    const nodeDropdown = $("#node-drop-down");
    nodeDropdown.change(() => {
        let numClueSelected = nodeDropdown.val().length;
        nodeView.resize(numClueSelected * 30, 180);
    });

    nodeDropdown.select2({
        closeOnSelect: false,
        placeholder: "select me"
    });

    // Center and reset node view
    resetZoomButton.click(() => nodeView.centerNode());

    // Open a SQLite Database File
    openSQLiteFileButton.click(openSQLite);

    // Save a SQLite Database file
    saveSQLiteFileButton.click(saveSQLite);

    ipcRenderer.on('table-view', () => showClueButton.trigger("click"));
    ipcRenderer.on('node-view', () => showNodeViewButton.trigger("click"));
    ipcRenderer.on('component-summary-view', () => showComponentButton.trigger("click"));
    ipcRenderer.on('open-SQLite', openSQLite);
    ipcRenderer.on('chart-summary-view', () => showBarChartButton.trigger("click"));
    ipcRenderer.on('save-SQLite', saveSQLite);
    ipcRenderer.on('import-JSON', importJson);
    ipcRenderer.on('export-JSON', exportJson);
    ipcRenderer.on('export-JSON-components-only', exportJsonComponents);

    // Open links in default browser
    $(".open-in-default").click((evt) => {
           evt.preventDefault();
           shell.openExternal(evt.target.href);
    });

    // Show clue DataTable. Hide node view and component summary table
    showClueButton.click(() => {
        splitter.show();
        cluesContainer.show();
        nodeContainer.hide();
        componentContainer.hide();
        barChartContainer.hide();
        dashboardContainer.hide();
        cluesTable.draw();
    });

    // Show node view. Hide clue and component table
    showNodeViewButton.click(() => {
        splitter.show();
        nodeContainer.show();
        cluesContainer.hide();
        componentContainer.hide();
        barChartContainer.hide();
        dashboardContainer.hide();
        nodeView.redraw();
    });

    // Show component summary table. Hide DataTable and node view
    showComponentButton.click(() => {
        splitter.hide();
        componentContainer.show();
        nodeContainer.hide();
        cluesContainer.hide();
        barChartContainer.hide();
        dashboardContainer.hide();
        componentsTable.reload();
    });

    showBarChartButton.click(() => {
        splitter.show();
        barChartContainer.show();
        componentContainer.hide();
        nodeContainer.hide();
        cluesContainer.hide();
        dashboardContainer.hide();
        barChart.draw();
        aboutCodeDB.getFileCount()
            .then((value) => {
                barChartTotalFiles.text(value);
            });
    });

    showDashboardButton.click(() => {
        splitter.hide();
        dashboardContainer.show();
        componentContainer.hide();
        nodeContainer.hide();
        cluesContainer.hide();
        barChartContainer.hide();
        dashboard.reload();
    });

    showDashboardButton.trigger("click");

    // Creates the database and all View objects from a SQLite file
    function loadDatabaseFromFile(fileName) {
        // Create a new database when importing a json file
        aboutCodeDB = new AboutCodeDB({
            dbName: "demo_schema",
            dbStorage: fileName
        });

        reloadDataForViews();
    }

    function reloadDataForViews() {
        // The flattened data is used by the clue table and jstree
        return aboutCodeDB.db
            .then(() => {
                jstree.database(aboutCodeDB);
                jstree.reload();

                // reload the DataTable after all insertions are done.
                cluesTable.database(aboutCodeDB);
                cluesTable.reload();

                componentsTable.database(aboutCodeDB);
                componentsTable.reload();

                dashboard.database(aboutCodeDB);
                dashboard.reload();

                nodeView = new AboutCodeNodeView("#nodeview", aboutCodeDB);
                nodeView.on('node-clicked', node => componentDialog().show(node.id));
                barChart = new AboutCodeBarChart("#summary-bar-chart", aboutCodeDB)
                    .onSummaryChanged(() => {
                        $("#summary-bar-chart rect").on("click", chartSummaryToFiles);
                        $("#summary-bar-chart .y.axis .tick").on("click", chartSummaryToFiles);
                    });

                aboutCodeDB.getFileCount()
                    .then((value) => {
                        barChartTotalFiles.text(value);
                    });

                return aboutCodeDB;
            })
            .catch(function(reason) {
               throw reason;
            });
    }

    // Show files that contain attribute value selected by user in bar chart
    function chartSummaryToFiles() {
        const val = $(this).data("value");

        if (val !== "No Value Detected") {
            // Get the clue table column and make sure it's visible
            const columnName = chartAttributesSelect.val();
            const column = cluesTable.dataTable.column(`${columnName}:name`);
            column.visible(true);

            // Clear all other columns
            clearClueDataTableFilterValue();

            // Get the column's filter select box
            const select = $(`select#clue-${columnName}`);
            select.empty().append(`<option value=""></option>`);

            // Add the chart value options and select it.
            select.append(`<option value="${val}">${val}</option>`);
            select.val(val).change();

            // This needs to be done only when the column is visible.
            // So we do it last to try our best
            showClueButton.trigger("click");
        }
    }

    // Clear all column filter that are set in clue DataTable
    function clearClueDataTableFilterValue() {
        $.each(AboutCodeDataTable.TABLE_COLUMNS, (i, column) => {
            const columnSelect = $(`select#clue-${column.name}`);
            columnSelect.val("");
            cluesTable.dataTable
                .column(`${column.name}:name`)
                .search("", false, false);
        });
    }

    // Open a SQLite Database File
    function openSQLite() {
        dialog.showOpenDialog({
            properties: ['openFile'],
            title: "Open a SQLite File",
            filters: [{
                name: 'SQLite File',
                extensions: ['sqlite']
            }]
        }, function(fileNames) {
            if (fileNames === undefined) return;
            loadDatabaseFromFile(fileNames[0]);
            clearClueDataTableFilterValue();
        });
    }

    // Save a SQLite Database File
    function saveSQLite() {
        dialog.showSaveDialog(
            {
                title: 'Save as a Database File',
                filters: [
                  { name: 'SQLite File', extensions: ['sqlite'] }
                ]
            },
            function (newFileName) {
                if (newFileName === undefined) return;

                let oldFileName = aboutCodeDB.sequelize.options.storage;
                let reader = fs.createReadStream(oldFileName);
                let writer = fs.createWriteStream(newFileName);
                reader.pipe(writer);
                reader.on("end", function () {
                    loadDatabaseFromFile(newFileName);
                });
            }
        );
    }

    function importJson() {
        dialog.showOpenDialog({
            title: "Open a JSON File",
            filters: [{
                name: 'JSON File',
                extensions: ['json']
            }]
        },
        function (fileNames) {
            if (fileNames === undefined) return;

            const jsonFileName = fileNames[0];

            // Immediately ask for a SQLite to save and create the database
            dialog.showSaveDialog(
                {
                    title: 'Save a SQLite Database File',
                    filters: [
                        { name: 'SQLite File', extensions: ['sqlite'] }
                    ]
                },
                function (fileName) {
                    if (fileName === undefined) return;

                    // Overwrite existing sqlite file
                    if (fs.existsSync(fileName)) {
                        fs.unlink(fileName, (err) => {
                          if (err) {
                              throw err;
                          }
                          console.info(`Deleted ${fileName}`);
                        });
                    }

                    // Create a new database when importing a json file
                    aboutCodeDB = new AboutCodeDB({
                        dbName: "demo_schema",
                        dbStorage: fileName,
                    });

                    const stream =
                        fs.createReadStream(jsonFileName, {encoding: 'utf8'});
                    aboutCodeDB.db
                        .then(() => showProgressIndicator())
                        .then(() => aboutCodeDB.addFromJsonStream(stream, aboutCodeVersion))
                        .then(() => reloadDataForViews())
                        .then(() => hideProgressIndicator())
                        .catch((err) => {
                            hideProgressIndicator();
                            if (err instanceof MissingFileInfoError) {
                                dialog.showErrorBox(
                                    "Missing File Type Information",
                                    "Missing file 'type' information in the " +
                                    "scanned data. \n\nThis probably means you ran " +
                                    "the scan without the -i option in ScanCode. " +
                                    "The app requires file information from a " +
                                    "ScanCode scan. Rerun the scan using \n./scancode " +
                                    "-clipeu options."
                                );
                            } else {
                                // Show error for problem with the JSON file
                                dialog.showErrorBox(
                                    "JSON Error",
                                    "There is a problem with your JSON file. It may be malformed " +
                                    "(e.g., the addition of a trailing comma), " +
                                    "or there could be some other problem with the file. " +
                                    "\n\nPlease check your file and try again. " +
                                    "\n\nThe error thrown by the system is: \n\n" + err
                                );
                            }
                            console.error(err);
                        });
                });
            clearClueDataTableFilterValue();
        });
    }

    // Show database creation indicator and hide table view
    function showProgressIndicator() {
        $("#db-indicator").show();
        $("#indicator-text").show();
        $("#tabbar").hide();
        $("#leftCol").hide();
    }

    // Hide database creation indicator and show table view
    function hideProgressIndicator() {
        $("#tabbar").show();
        $("#leftCol").show();
        $("#db-indicator").hide();
        $("#indicator-text").hide();
    }

    // Export JSON file with ScanCode data and components that have been created
    function exportJson() {
        dialog.showSaveDialog({
            properties: ['openFile'],
            title: "Save as JSON file",
            filters: [{
                name: 'JSON File Type',
                extensions: ['json']
            }]
        },
            function (fileName) {
                if (fileName === undefined) return;

                let clueFiles = aboutCodeDB.findAll({
                    attributes: {
                        exclude: ["id", "createdAt", "updatedAt"]
                    }
                });

                let components = aboutCodeDB.findAllComponents({
                    attributes: {
                        exclude: ["id", "createdAt", "updatedAt"]
                    }
                });

                Promise.all([clueFiles, components])
                    .then((arguments) => {
                        let json = {
                            files: arguments[0],
                            components: arguments[1]
                        };

                        fs.writeFile(fileName, JSON.stringify(json), (err) => {
                            if (err) throw err;
                        });
                    });

            });
    }

    // Export JSON file with only components that have been created
    function exportJsonComponents() {
        dialog.showSaveDialog({
            properties: ['openFile'],
            title: "Save as JSON file",
            filters: [{
                name: 'JSON File Type',
                extensions: ['json']
            }]
        },
            function (fileName) {
                if (fileName === undefined) return;

                aboutCodeDB.findAllComponents({
                    attributes: {
                        exclude: ["id", "createdAt", "updatedAt"]
                    }
                })
                .then((components) => {
                    let json = {
                        components: components
                    };

                    fs.writeFile(fileName, JSON.stringify(json), (err) => {
                        if (err) throw err;
                    });
                });

            });
    }
});

module.exports = aboutCodeVersion;