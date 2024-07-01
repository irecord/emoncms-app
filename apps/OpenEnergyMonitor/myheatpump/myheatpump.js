feed.apikey = apikey;
feed.public_userid = public_userid;
feed.public_username = public_username;
// ----------------------------------------------------------------------
// Display
// ----------------------------------------------------------------------

$(window).ready(function () {

});

if (!session_write) $(".config-open").hide();

// ----------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------
config.app = {
    "app_name": { "type": "value", "name": "App name", "default": "MY HEATPUMP", "optional": true, "description": "Enter custom name for app" },
    "public": { "type": "checkbox", "name": "Public", "default": 0, "optional": true, "description": "Make app public" },
    "heatpump_elec": { "type": "feed", "autoname": "heatpump_elec", "optional": true, "description": "Electric use in watts" },
    "heatpump_elec_kwh": { "type": "feed", "autoname": "heatpump_elec_kwh", "description": "Cumulative electric use kWh" },
    "heatpump_heat": { "type": "feed", "autoname": "heatpump_heat", "optional": true, "description": "Heat output in watts" },
    "heatpump_heat_kwh": { "type": "feed", "autoname": "heatpump_heat_kwh", "optional": true, "description": "Cumulative heat output in kWh" },
    "heatpump_flowT": { "type": "feed", "autoname": "heatpump_flowT", "optional": true, "description": "Flow temperature" },
    "heatpump_returnT": { "type": "feed", "autoname": "heatpump_returnT", "optional": true, "description": "Return temperature" },
    "heatpump_outsideT": { "type": "feed", "autoname": "heatpump_outsideT", "optional": true, "description": "Outside temperature" },
    "heatpump_roomT": { "type": "feed", "autoname": "heatpump_roomT", "optional": true, "description": "Room temperature" },
    "heatpump_targetT": { "type": "feed", "autoname": "heatpump_targetT", "optional": true, "description": "Target (Room or Flow) Temperature" },
    "heatpump_flowrate": { "type": "feed", "autoname": "heatpump_flowrate", "optional": true, "description": "Flow rate" },
    "heatpump_dhw": { "type": "feed", "autoname": "heatpump_dhw", "optional": true, "description": "Status of Hot Water circuit (non-zero when running)" },
    "heatpump_ch": { "type": "feed", "autoname": "heatpump_ch", "optional": true, "description": "Status of Central Heating circuit (non-zero when running)" },
    "start_date": { "type": "value", "default": 0, "name": "Start date", "description": _("Start date for all time values (unix timestamp)") },
};
config.feeds = feed.list();

config.initapp = function () { init() };
config.showapp = function () { show() };
config.hideapp = function () { clear() };

// ----------------------------------------------------------------------
// APPLICATION
// ----------------------------------------------------------------------
var meta = {};
var data = {};
var bargraph_series = [];
var powergraph_series = [];
var previousPoint = false;
var viewmode = "bargraph";
var panning = false;
var flot_font_size = 12;
var updaterinst = false;
var elec_enabled = false;
var heat_enabled = false;
var feeds = {};
var progtime = 0;
var firstrun = true;
var heatpump_elec_start = 0;
var heatpump_heat_start = 0;
var start_time = 0;
var end_time = 0;
var show_flow_rate = false;
var show_instant_cop = false;
var exclude_dhw = false;
var inst_cop_min = 2;
var inst_cop_max = 6;
var inst_cop_mv_av_dp = 0;
var kw_at_50 = 0;
var kw_at_50_for_volume = 0;
var show_daily_cop_series = true;
var show_negative_heat = false;
var emitter_spec_enable = false;

var realtime_cop_div_mode = "30min";

var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// duration contants (milliseonds)
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

config.init();

function init() {
    // Quick translation of feed ids
    feeds = {};
    for (var key in config.app) {
        if (config.app[key].value) feeds[key] = config.feedsbyid[config.app[key].value];

    }
}

function show() {
    $("#app_name").html(config.app['app_name'].value);

    $("body").css('background-color', 'WhiteSmoke');
    // -------------------------------------------------------------------------------
    // Configurations
    // -------------------------------------------------------------------------------
    if (feeds["heatpump_elec_kwh"] != undefined) elec_enabled = true;
    if (feeds["heatpump_heat"] != undefined && feeds["heatpump_heat_kwh"] != undefined) heat_enabled = true;
    if (feeds["heatpump_flowrate"] != undefined) {
        $("#show_flow_rate_bound").show();
    }

    if (feeds["heatpump_dhw"] == undefined) {
        $(".show_stats_category[key='water_heating']").hide();
        $(".show_stats_category[key='space_heating']").hide();
    } else {
        $(".show_stats_category[key='water_heating']").show();
        $(".show_stats_category[key='space_heating']").show();
    }

    // -------------------------------------------------------------------------------

    if (elec_enabled) {
        meta["heatpump_elec_kwh"] = feed.getmeta(feeds["heatpump_elec_kwh"].id);
        if (feeds["heatpump_elec"] != undefined) meta["heatpump_elec"] = feed.getmeta(feeds["heatpump_elec"].id);
        if (meta["heatpump_elec_kwh"].start_time > start_time) start_time = meta["heatpump_elec_kwh"].start_time;
        if (meta["heatpump_elec_kwh"].end_time > end_time) end_time = meta["heatpump_elec_kwh"].end_time;
    }

    if (heat_enabled) {
        meta["heatpump_heat_kwh"] = feed.getmeta(feeds["heatpump_heat_kwh"].id);
        meta["heatpump_heat"] = feed.getmeta(feeds["heatpump_heat"].id);
        if (meta["heatpump_heat_kwh"].start_time > start_time) start_time = meta["heatpump_heat_kwh"].start_time;
        if (meta["heatpump_heat_kwh"].end_time > end_time) end_time = meta["heatpump_heat_kwh"].end_time;

        $("#show_negative_heat_bound").show();
    }

    var alltime_start_time = start_time;
    var config_start_date = config.app.start_date.value * 1;
    if (config_start_date > alltime_start_time) {
        alltime_start_time = config_start_date;
        var d = new Date(alltime_start_time * 1000);
        $("#all_time_history_title").html("TOTAL SINCE: " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear());
    } else {
        var d = new Date(start_time * 1000);
        $("#all_time_history_title").html("TOTAL SINCE: " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear());
    }

    // Load elec start here after start_time may have been modified by heat start time
    if (elec_enabled) {
        heatpump_elec_start = feed.getvalue(feeds["heatpump_elec_kwh"].id, alltime_start_time);
    }

    if (heat_enabled) {
        heatpump_heat_start = feed.getvalue(feeds["heatpump_heat_kwh"].id, alltime_start_time);
    }

    resize();

    var date = new Date();
    var now = date.getTime();

    end = end_time * 1000;

    if (now - end > HOUR) {
        $("#last_updated").show();
        $("#live_table").hide();
        date.setTime(end);
        let h = date.getHours();
        let m = date.getMinutes();
        if (h < 10) h = "0" + h;
        if (m < 10) m = "0" + m;
        $("#last_updated").html("Last updated: " + date.toDateString() + " " + h + ":" + m)
    } else {
        $("#last_updated").hide();
        $("#live_table").show();
    }

    if (urlParams.mode != undefined) {
        if (urlParams.mode == "power") {
            viewmode = "powergraph"
            $("#advanced-block").show();
            $("#advanced-toggle").html("HIDE DETAIL");
        }
        if (urlParams.cop) {
            $("#show_instant_cop").click();
            show_instant_cop = true;
            $("#inst_cop_options").show();
        }
        if (urlParams.flow) {
            $("#show_flow_rate").click();
            show_flow_rate = true;
        }
        if (urlParams.carnot) {
            $("#carnot_enable")[0].click();
            $("#heatpump_factor").val(urlParams.carnot);
        }
    }

    // If this is a new dashboard there will be less than a days data 
    // show power graph directly in this case
    var timeWindow = (end - start_time * 1000);
    if (timeWindow < 3 * DAY || viewmode == "powergraph") {
        if (timeWindow > 3 * DAY) timeWindow = DAY;
        var start = end - timeWindow;

        if (urlParams.start != undefined) start = urlParams.start * 1000;
        if (urlParams.end != undefined) end = urlParams.end * 1000;
        if (urlParams.hours != undefined) start = end - urlParams.hours * HOUR;

        view.start = start;
        view.end = end;
        viewmode = "powergraph";
        $(".bargraph-navigation").hide();
        powergraph_load();
        $(".powergraph-navigation").show();
        $("#advanced-toggle").show();
    } else {
        var timeWindow = 30 * DAY;
        var start = end - timeWindow;
        if (start < (start_time * 1000)) start = start_time * 1000;

        if (urlParams.start != undefined) start = urlParams.start * 1000;
        if (urlParams.end != undefined) end = urlParams.end * 1000;

        bargraph_load(start, end);
        bargraph_draw();
        $("#advanced-toggle").hide();
    }

    // LOOP
    progtime = now;
    updater();
    updaterinst = setInterval(updater, 10000);
    $(".ajax-loader").hide();
}

function clear() {
    clearInterval(updaterinst);
}

function updater() {
    feed.listbyidasync(function (result) {
        if (result === null) { return; }

        for (var key in config.app) {
            if (config.app[key].value) feeds[key] = result[config.app[key].value];
        }

        if (feeds["heatpump_elec"] != undefined) $("#heatpump_elec").html(Math.round(feeds["heatpump_elec"].value));
        if (feeds["heatpump_heat"] != undefined) $("#heatpump_heat").html(Math.round(feeds["heatpump_heat"].value));
        if (feeds["heatpump_flowT"] != undefined) $("#heatpump_flowT").html((1 * feeds["heatpump_flowT"].value).toFixed(1));

        if (realtime_cop_div_mode == "inst" && feeds["heatpump_elec"] != undefined && feeds["heatpump_heat"] != undefined) {
            var COP_inst = 0;
            if (feeds["heatpump_elec"].value > 0) {
                COP_inst = feeds["heatpump_heat"].value / feeds["heatpump_elec"].value;
            }
            $("#realtime_cop_value").html(COP_inst.toFixed(2));
        }

        // Update all-time values
        var total_elec = 0;
        var total_heat = 0;
        if (elec_enabled) total_elec = feeds["heatpump_elec_kwh"].value - heatpump_elec_start;
        if (heat_enabled) total_heat = feeds["heatpump_heat_kwh"].value - heatpump_heat_start;

        var total_cop = 0;
        if (total_elec > 0) total_cop = total_heat / total_elec;
        if (total_cop < 0) total_cop = 0;

        if (total_elec < 20) {
            total_elec = total_elec.toFixed(1);
        } else {
            total_elec = total_elec.toFixed(0);
        }

        if (total_heat < 20) {
            total_heat = total_heat.toFixed(1);
        } else {
            total_heat = total_heat.toFixed(0);
        }

        $("#total_elec").html(total_elec);
        $("#total_heat").html(total_heat);
        $("#total_cop").html(total_cop.toFixed(2));

        // Updates every 60 seconds
        var now = new Date().getTime();
        if ((progtime < (now - MINUTE)) || firstrun) {
            firstrun = false;
            
            var elec = 0; var heat = 0;
            if (elec_enabled) elec = get_average("heatpump_elec", 1800);
            if (heat_enabled) heat = get_average("heatpump_heat", 1800);

            var COP = 0;
            if (elec > 0 && heat > 0) COP = heat / elec;
            if (realtime_cop_div_mode == "30min") {
                $("#realtime_cop_value").html(COP.toFixed(2));
            }

            if (feeds["heatpump_elec"] == undefined) $("#heatpump_elec").html(Math.round(elec * HOUR / (60 * 30)));
            if (feeds["heatpump_heat"] == undefined) $("#heatpump_heat").html(Math.round(heat * HOUR / (60 * 30)));

            // update power chart if showing up to last 5 minutes, and less than 48 hours
            if (viewmode == "powergraph") {
                var timeWindow = (view.end - view.start);
                if (view.end > progtime - 5 * MINUTE && timeWindow <= 2 * DAY) {
                    if (view.end < now) {
                        // automatically scroll power chart if at the end
                        view.end = now;
                        view.start = view.end - timeWindow;
                    }




                    powergraph_load();
                }
            }
            progtime = now;
        }
    });
}

function get_average(name, duration) {

    if (feeds[name] == undefined) return null;

    var dps = feed.getdata(feeds[name].id, feeds[name].time - duration, feeds[name].time, 60, 1, 0, 0, 0);
    var sum = 0;
    var n = 0;
    for (var z in dps) {
        sum += dps[z][1];
        n++;
    }
    return sum / n;
}

// -------------------------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------------------------
// The buttons for these powergraph events are hidden when in historic mode 
// The events are loaded at the start here and dont need to be unbinded and binded again.
$("#zoomout").click(function () { view.zoomout(); powergraph_load(); });
$("#zoomin").click(function () { view.zoomin(); powergraph_load(); });
$('#right').click(function () { view.panright(); powergraph_load(); });
$('#left').click(function () { view.panleft(); powergraph_load(); });

$('.time').click(function () {
    view.timewindow($(this).attr("time") / 24.0);
    powergraph_load();
});

$(".viewhistory").click(function () {
    $(".powergraph-navigation").hide();
    var timeWindow = 30 * DAY;
    // var end = (new Date()).getTime();
    var end = end_time * 1000;
    var start = end - timeWindow;
    if (start < (start_time * 1000)) start = start_time * 1000;
    viewmode = "bargraph";
    bargraph_load(start, end);
    bargraph_draw();
    $(".bargraph-navigation").show();
    $("#advanced-toggle").hide();
    $("#advanced-block").hide();
});

$("#advanced-toggle").click(function () {
    var state = $(this).html();

    if (state == "SHOW DETAIL") {
        $("#advanced-block").show();
        $("#advanced-toggle").html("HIDE DETAIL");

    } else {
        $("#advanced-block").hide();
        $("#advanced-toggle").html("SHOW DETAIL");
    }
});

$('#placeholder').bind("plothover", function (event, pos, item) {
    if (item) {
        var z = item.dataIndex;

        if (previousPoint != item.datapoint) {
            previousPoint = item.datapoint;

            $("#tooltip").remove();
            if (viewmode == "bargraph") {
                var itemTime = item.datapoint[0];
                var elec_kwh = null;
                var heat_kwh = null;
                if (elec_enabled && data["heatpump_elec_kwhd"].length && data["heatpump_elec_kwhd"][z] != undefined) elec_kwh = data["heatpump_elec_kwhd"][z][1];
                if (heat_enabled && data["heatpump_heat_kwhd"].length && data["heatpump_heat_kwhd"][z] != undefined) heat_kwh = data["heatpump_heat_kwhd"][z][1];

                var outside_temp_str = "";
                if (feeds["heatpump_outsideT"] != undefined) {
                    if (data["heatpump_outsideT_daily"] != undefined && data["heatpump_outsideT_daily"].length && data["heatpump_outsideT_daily"][z] != undefined) {
                        let outsideT = data["heatpump_outsideT_daily"][z][1];
                        if (outsideT != null) {
                            outside_temp_str = "Outside: " + outsideT.toFixed(1) + "°C<br>";
                        }
                    }
                }

                var COP = null;
                if (heat_kwh !== null && elec_kwh !== null) COP = heat_kwh / elec_kwh;

                var d = new Date(itemTime);
                var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                var date = days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();

                if (elec_kwh !== null) elec_kwh = (elec_kwh).toFixed(1); else elec_kwh = "---";
                if (heat_kwh !== null) heat_kwh = (heat_kwh).toFixed(1); else heat_kwh = "---";
                if (COP !== null) COP = (COP).toFixed(1); else COP = "---";

                tooltip(item.pageX, item.pageY, date + "<br>Electric: " + elec_kwh + " kWh<br>Heat: " + heat_kwh + " kWh<br>" + outside_temp_str + "COP: " + COP, "#fff", "#000");
            }

            if (viewmode == "powergraph") {
                var itemTime = item.datapoint[0];
                var itemValue = item.datapoint[1];

                var d = new Date(itemTime);
                var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                var date = days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();

                var h = d.getHours();
                if (h < 10) h = "0" + h;
                var m = d.getMinutes();
                if (m < 10) m = "0" + m;
                var time = h + ":" + m;

                var name = "";
                var unit = "";
                var dp = 0;

                if (item.series.label == "FlowT") { name = "FlowT"; unit = "°C"; dp = 1; }
                else if (item.series.label == "ReturnT") { name = "ReturnT"; unit = "°C"; dp = 1; }
                else if (item.series.label == "OutsideT") { name = "Outside"; unit = "°C"; dp = 1; }
                else if (item.series.label == "RoomT") { name = "Room"; unit = "°C"; dp = 1; }
                else if (item.series.label == "TargetT") { name = "Target"; unit = "°C"; dp = 1; }
                else if (item.series.label == "DHW") { name = "Hot Water"; unit = ""; dp = 0; }
                else if (item.series.label == "CH") { name = "Central Heating"; unit = ""; dp = 0; }
                else if (item.series.label == "Electric") { name = "Elec"; unit = "W"; }
                else if (item.series.label == "Heat") { name = "Heat"; unit = "W"; }
                else if (item.series.label == "Carnot Heat") { name = "Carnot Heat"; unit = "W"; }
                else if (item.series.label == "Simulated flow rate") { name = "Simulated flow rate"; unit = ""; dp = 3; }
                else if (item.series.label == "Inst COP") { name = "Inst COP"; unit = ""; dp = 1; }
                else if (item.series.label == "Flow rate") {
                    name = "Flow rate";
                    unit = " " + feeds["heatpump_flowrate"].unit;
                    dp = 3;
                }

                tooltip(item.pageX, item.pageY, name + " " + itemValue.toFixed(dp) + unit + "<br>" + date + ", " + time, "#fff", "#000");
            }
        }
    } else $("#tooltip").remove();
});

// Auto click through to power graph
$('#placeholder').bind("plotclick", function (event, pos, item) {
    if (item && !panning && viewmode == "bargraph") {
        var z = item.dataIndex;
        view.start = data["heatpump_elec_kwhd"][z][0];
        view.end = view.start + DAY;
        $(".bargraph-navigation").hide();
        viewmode = "powergraph";
        powergraph_load();
        $(".powergraph-navigation").show();
        $("#advanced-toggle").show();

        if ($("#advanced-toggle").html() == "SHOW DETAIL") {
            $("#advanced-block").hide();
        } else {
            $("#advanced-block").show();
        }

    }
});

$('#placeholder').bind("plotselected", function (event, ranges) {
    var start = ranges.xaxis.from;
    var end = ranges.xaxis.to;
    panning = true;

    if (viewmode == "bargraph") {
        bargraph_load(start, end);
        bargraph_draw();
    } else {
        view.start = start; view.end = end;
        powergraph_load();
    }
    setTimeout(function () { panning = false; }, 100);
});

$('.bargraph-alltime').click(function () {
    var start = start_time * 1000;
    var end = (new Date()).getTime();
    bargraph_load(start, end);
    bargraph_draw();
});

$('.bargraph-day').click(function () {
    view.timewindow(1.0);
    $(".bargraph-navigation").hide();
    viewmode = "powergraph";
    powergraph_load();
    $(".powergraph-navigation").show();

    $("#advanced-toggle").show();
    if ($("#advanced-toggle").html() == "SHOW DETAIL") {
        $("#advanced-block").hide();
    } else {
        $("#advanced-block").show();
    }
});

$('.bargraph-week').click(function () {
    var timeWindow = 7 * DAY;
    var end = (new Date()).getTime();
    var start = end - timeWindow;
    if (start < (start_time * 1000)) start = start_time * 1000;
    bargraph_load(start, end);
    bargraph_draw();
});

$('.bargraph-month').click(function () {
    var timeWindow = 30 * DAY;
    var end = (new Date()).getTime();
    var start = end - timeWindow;
    if (start < (start_time * 1000)) start = start_time * 1000;
    bargraph_load(start, end);
    bargraph_draw();
});

$('.bargraph-quarter').click(function () {
    var timeWindow = 91 * DAY;
    var end = (new Date()).getTime();
    var start = end - timeWindow;
    if (start < (start_time * 1000)) start = start_time * 1000;
    bargraph_load(start, end);
    bargraph_draw();
});

$('.bargraph-year').click(function () {
    var timeWindow = 365 * DAY;
    var end = (new Date()).getTime();
    var start = end - timeWindow;
    if (start < (start_time * 1000)) start = start_time * 1000;
    bargraph_load(start, end);
    bargraph_draw();
});

$("#carnot_enable").click(function () {

    if ($("#carnot_enable_prc")[0].checked && !$("#carnot_enable")[0].checked) {
        $("#carnot_enable_prc")[0].checked = 0;
    }

    if ($("#carnot_enable")[0].checked) {
        $("#carnot_sim_options").show();
    } else {
        $("#carnot_sim_options").hide();
        $("#carnot_prc_options").hide();
    }

    powergraph_process();
});

$("#carnot_enable_prc").click(function () {

    if ($("#carnot_enable_prc")[0].checked) {
        $("#carnot_enable")[0].checked = 1;
        $("#heatpump_factor")[0].disabled = 1;
        $("#carnot_prc_options").show();
        $("#carnot_sim_options").show();
    } else {
        $("#heatpump_factor")[0].disabled = 0;
        $("#carnot_prc_options").hide();
    }

    powergraph_process();
});

$("#stats_when_running").click(function () {
    if ($("#stats_when_running")[0].checked) {
        $("#mean_when_running").show();
        if (feeds["heatpump_dhw"] != undefined) {
            $("#stats_without_dhw").show();
        }
    } else {
        $("#mean_when_running").hide();
        $("#stats_without_dhw").hide();
    }

    powergraph_process();
});

$("#exclude_dhw").click(function () {
    powergraph_process();
});

$("#condensing_offset").change(function () {
    powergraph_process();
});

$("#evaporator_offset").change(function () {
    powergraph_process();
});

$("#heatpump_factor").change(function () {
    powergraph_process();
});

$("#starting_power").change(function () {
    powergraph_process();
});

$("#fixed_outside_temperature").change(function () {
    powergraph_process();
});

// -------------------------------------------------------------------------------
// FUNCTIONS
// -------------------------------------------------------------------------------
// - powergraph_load
// - powergraph_draw
// - bargraph_load
// - bargraph_draw
// - resize


function powergraph_load() {
    var skipmissing = 0;
    var limitinterval = 0;

    view.calc_interval(1200);

    powergraph_series = {};

    // Index order is important here!
    var feeds_to_load = {
        "heatpump_dhw": { label: "DHW", yaxis: 4, color: "#88F", lines: { lineWidth: 0, show: true, fill: 0.15 } },
        "heatpump_ch": { label: "CH", yaxis: 4, color: "#FB6", lines: { lineWidth: 0, show: true, fill: 0.15 } },
        "heatpump_targetT": { label: "TargetT", yaxis: 2, color: "#ccc" },
        "heatpump_flowT": { label: "FlowT", yaxis: 2, color: 2 },
        "heatpump_returnT": { label: "ReturnT", yaxis: 2, color: 3 },
        "heatpump_outsideT": { label: "OutsideT", yaxis: 2, color: 4 },
        "heatpump_roomT": { label: "RoomT", yaxis: 2, color: "#000" },
        "heatpump_flowrate": { label: "Flow rate", yaxis: 3, color: 6 },
        "heatpump_heat": { label: "Heat", yaxis: 1, color: 0, lines: { show: true, fill: 0.2, lineWidth: 0.5 } },
        "heatpump_elec": { label: "Electric", yaxis: 1, color: 1, lines: { show: true, fill: 0.3, lineWidth: 0.5 } }
    }

    // Compile list of feedids
    var feedids = [];
    for (var key in feeds_to_load) {
        if (feeds[key] != undefined) feedids.push(feeds[key].id);
    }

    var average = 1;
    if (view.interval < 20) average = 0;

    // Fetch the data
    feed.getdata(feedids, view.start, view.end, view.interval, average, 0, skipmissing, limitinterval, function (all_data) {
        // Transfer from data to all_data by key
        var feed_index = 0;
        for (var key in feeds_to_load) {
            if (feeds[key] != undefined && all_data[feed_index] != undefined) {
                // Data object used for calculations
                data[key] = remove_null_values(all_data[feed_index].data, view.interval);
                feed_index++;

                // Load to powergraph_series (used for drawing the graph)
                let series = feeds_to_load[key];
                series.data = data[key];
                powergraph_series[key] = series;
            }
        }

        if (feeds["heatpump_outsideT"] != undefined) {
            $("#fixed_outside_temperature_bound").hide();
        } else {
            $("#fixed_outside_temperature_bound").show();
        }

        powergraph_process();
    }, false, "notime");

    // Consider supporting conversion of kWh data to power again here
    // old code:

    /* else {
        // Where no power feed available
        // need a check here to limit interval to no lower than 120s     
        view.calc_interval(50,120);
        
        if (heat_enabled) {
            var tmp = feed.getdata(feeds["heatpump_heat_kwh"].id,view.start,view.end,view.interval);
            data["heatpump_heat"] = [];
            for (var z=1; z<tmp.length; z++) {
                var time = tmp[z-1][0];
                var diff = tmp[z][1] - tmp[z-1][1];
                var power = (diff * HOUR) / view.interval;
                if (power<0) power = 0;
                data["heatpump_heat"].push([time,power]);
            }
            powergraph_series.push({label:"Heat", data:data["heatpump_heat"], yaxis:1, color:0, bars:{show:true, barWidth: view.interval * 1000 * 0.8, fill:0.2}});
        }
        
        if (elec_enabled) {
            var tmp = feed.getdata(feeds["heatpump_elec_kwh"].id,view.start,view.end,view.interval);
            data["heatpump_elec"] = [];
            for (var z=1; z<tmp.length; z++) {
                var time = tmp[z-1][0];
                var diff = tmp[z][1] - tmp[z-1][1];  // diff in kWh
                var power = (diff * HOUR) / view.interval;
                if (power<0) power = 0;
                data["heatpump_elec"].push([time,power]);
            }
            powergraph_series.push({label:"Electric", data:data["heatpump_elec"], yaxis:1, color:1, bars:{show:true, barWidth: view.interval * 1000 * 0.8, fill:0.3}});
        }
    }*/

}

// Called from powergraph_load and when changing settings
// This function processes the data and loads it into powergraph_series
function powergraph_process() {
    // process_stats: calculates min, max, mean, total, etc
    process_stats();
    // Different approach for cop calculations
    calculate_window_cops();
    // carnor_simulator: calculates carnot heat output
    carnot_simulator();
    // process_inst_cop: calculates instantaneous COP
    process_inst_cop();
    // process_cooling: calculates cooling
    process_cooling();
    // calculates emitter and volume
    emitter_and_volume_calculator();
    // calculate starts
    compressor_starts();

    // Load powergraph_series into flot
    powergraph_draw();
}

function carnot_simulator() {
    var simulate_heat_output = $("#carnot_enable")[0].checked;
    var show_as_prc_of_carnot = $("#carnot_enable_prc")[0].checked;

    data["heatpump_heat_carnot"] = [];
    data["sim_flow_rate"] = [];
    powergraph_series['carnot'] = [];
    powergraph_series['sim_flow_rate'] = [];

    if (simulate_heat_output && data["heatpump_elec"] != undefined && data["heatpump_flowT"] != undefined) {

        var condensing_offset = parseFloat($("#condensing_offset").val());
        var evaporator_offset = parseFloat($("#evaporator_offset").val());
        var heatpump_factor = parseFloat($("#heatpump_factor").val());
        var fixed_outside_temperature = parseFloat($("#fixed_outside_temperature").val());

        var heatpump_outsideT_available = false;
        if (data["heatpump_outsideT"] != undefined) {
            heatpump_outsideT_available = true;
        }

        // Carnot COP simulator
        var practical_carnot_heat_sum = 0;
        var ideal_carnot_heat_sum = 0;
        var carnot_heat_n = 0;
        var practical_carnot_heat_kwh = 0;
        var ideal_carnot_heat_kwh = 0;

        var flowT = 0;
        var returnT = 0;
        var ambientT = 0;
        var heat = 0;

        var histogram = {};

        for (var z in data["heatpump_elec"]) {

            let time = data["heatpump_elec"][z][0];
            let power = data["heatpump_elec"][z][1];

            if (data["heatpump_heat"] != undefined) heat = data["heatpump_heat"][z][1];
            if (data["heatpump_flowT"] != undefined) flowT = data["heatpump_flowT"][z][1];
            if (data["heatpump_returnT"] != undefined) returnT = data["heatpump_returnT"][z][1];

            if (heatpump_outsideT_available) {
                ambientT = data["heatpump_outsideT"][z][1];
            } else {
                ambientT = fixed_outside_temperature;
            }

            let carnot_COP = ((flowT + condensing_offset + 273) / ((flowT + condensing_offset + 273) - (ambientT + evaporator_offset + 273)));

            let practical_carnot_heat = null;
            let ideal_carnot_heat = null;
            let sim_flow_rate = null;

            if (power != null && carnot_COP != null) {
                practical_carnot_heat = power * carnot_COP * heatpump_factor;
                ideal_carnot_heat = power * carnot_COP;

                DT = flowT - returnT
                sim_flow_rate = (practical_carnot_heat / (DT * 4150)) * 3.6;
                if (DT < 1.0) {
                    sim_flow_rate = null
                }

                if (returnT > flowT) {
                    practical_carnot_heat *= -1;
                    ideal_carnot_heat *= -1;
                }

                practical_carnot_heat_sum += practical_carnot_heat;
                ideal_carnot_heat_sum += ideal_carnot_heat;
                carnot_heat_n++;

                practical_carnot_heat_kwh += practical_carnot_heat * view.interval / HOUR;
                ideal_carnot_heat_kwh += ideal_carnot_heat * view.interval / HOUR;

                if (heat != 0 && power != 0 && carnot_COP != 0) {
                    let COP = heat / power;
                    let practical_efficiency = COP / carnot_COP;
                    if (practical_efficiency >= 0 && practical_efficiency <= 1) {
                        let bucket = Math.round(1 * practical_efficiency * 200) / 200

                        if (histogram[bucket] == undefined) histogram[bucket] = 0
                        histogram[bucket] += heat * view.interval / HOUR;
                    }
                }
            }



            data["heatpump_heat_carnot"][z] = [time, practical_carnot_heat];
            data["sim_flow_rate"][z] = [time, sim_flow_rate];
        }

        var practical_carnot_heat_mean = practical_carnot_heat_sum / carnot_heat_n;
        var ideal_carnot_heat_mean = ideal_carnot_heat_sum / carnot_heat_n;
        if (simulate_heat_output && !show_as_prc_of_carnot) {
            powergraph_series['carnot'] = { label: "Carnot Heat", data: data["heatpump_heat_carnot"], yaxis: 1, color: 7, lines: { show: true, fill: 0.05, lineWidth: 0.8 } };
            // Uncomment to show simulated flow rate (experimental)
            // powergraph_series['sim_flow_rate'] = { label: "Simulated flow rate", data: data["sim_flow_rate"], yaxis: 3, color: "#000", lines: { show: true, fill: false, lineWidth: 1.0 } };
        }

        if (show_as_prc_of_carnot) {
            $("#histogram_bound").show();
            draw_histogram(histogram);
        } else {
            $("#histogram_bound").hide();
        }

        if (show_as_prc_of_carnot) {
            let prc_of_carnot = (100 * stats['combined']['heatpump_heat'].mean / ideal_carnot_heat_mean).toFixed(1);
            $("#window-carnot-cop").html("(<b>" + prc_of_carnot + "%</b> of Carnot)");
            $("#heatpump_factor").val(prc_of_carnot * 0.01)
        } else {
            $("#window-carnot-cop").html("(Simulated: <b>" + (practical_carnot_heat_mean / stats['combined']['heatpump_elec'].mean).toFixed(2) + "</b>)");
        }
        $("#standby_cop_simulated").html(" (Simulated: " + (practical_carnot_heat_kwh / stats['when_running']['heatpump_elec'].kwh).toFixed(2) + ")");

    } else {
        $("#window-carnot-cop").html("");
    }
}

function process_cooling() {

    if (data["heatpump_heat"] != undefined) {

        var total_positive_heat_kwh = 0;
        var total_negative_heat_kwh = 0;

        for (var z in data["heatpump_heat"]) {
            let heat = data["heatpump_heat"][z][1];

            if (heat != null) {
                if (heat >= 0) {
                    total_positive_heat_kwh += heat * view.interval / HOUR
                } else {
                    total_negative_heat_kwh += -1 * heat * view.interval / HOUR
                }
            }
        }

        $("#total_positive_heat_kwh").html(total_positive_heat_kwh.toFixed(3));
        $("#total_negative_heat_kwh").html(total_negative_heat_kwh.toFixed(3));
        $("#prc_negative_heat").html((100 * total_negative_heat_kwh / total_positive_heat_kwh).toFixed(1));
        $("#total_net_heat_kwh").html((total_positive_heat_kwh - total_negative_heat_kwh).toFixed(3));
    }
}

function process_stats() {
    stats = {};
    stats.combined = {};
    stats.when_running = {};
    stats.space_heating = {};
    stats.water_heating = {};

    var feed_options = {
        "heatpump_elec": { name: "Electric consumption", unit: "W", dp: 0 },
        "heatpump_heat": { name: "Heat output", unit: "W", dp: 0 },
        "heatpump_heat_carnot": { name: "Simulated heat output", unit: "W", dp: 0 },
        "heatpump_flowT": { name: "Flow temperature", unit: "°C", dp: 1 },
        "heatpump_returnT": { name: "Return temperature", unit: "°C", dp: 1 },
        "heatpump_outsideT": { name: "Outside temperature", unit: "°C", dp: 1 },
        "heatpump_roomT": { name: "Room temperature", unit: "°C", dp: 1 },
        "heatpump_targetT": { name: "Target temperature", unit: "°C", dp: 1 },
        "heatpump_flowrate": { name: "Flow rate", unit: "", dp: 3 }
    }

    var keys = [];
    for (var key in feed_options) {
        if (data[key] != undefined) {
            keys.push(key);
        }
    }

    for (var z in keys) {
        let key = keys[z];

        for (var x in stats) {
            stats[x][key] = {};
            stats[x][key].sum = 0;
            stats[x][key].count = 0;
            stats[x][key].mean = null;
            stats[x][key].kwh = null;
            stats[x][key].minval = null;
            stats[x][key].maxval = null;
        }
    }

    var starting_power = parseFloat($("#starting_power").val());

    var dhw_enable = false;
    if (data["heatpump_dhw"] != undefined) dhw_enable = true;

    for (var z in data["heatpump_elec"]) {
        let power = data["heatpump_elec"][z][1];

        let dhw = false;
        if (dhw_enable) dhw = data["heatpump_dhw"][z][1];

        // let ch = false;
        // if (data["heatpump_ch"]!=undefined) ch = data["heatpump_ch"][z][1];

        for (var i in keys) {
            let key = keys[i];
            if (data[key][z] != undefined) {
                let value = data[key][z][1];
                if (value != null) {

                    stats.combined[key].sum += value;
                    stats.combined[key].count++;
                    stats_min_max('combined', key, value);

                    if (power != null && power >= starting_power) {
                        stats.when_running[key].sum += value;
                        stats.when_running[key].count++;
                        stats_min_max('when_running', key, value);

                        if (dhw_enable) {
                            if (dhw) {
                                stats.water_heating[key].sum += value;
                                stats.water_heating[key].count++;
                                stats_min_max('water_heating', key, value);
                            } else {
                                stats.space_heating[key].sum += value;
                                stats.space_heating[key].count++;
                                stats_min_max('space_heating', key, value);
                            }
                        }
                    }
                }
            }
        }
    }

    for (var x in stats) {
        let out = "";

        for (var z in keys) {
            let key = keys[z];

            stats[x][key].mean = null;
            if (stats[x][key].count > 0) {
                stats[x][key].mean = stats[x][key].sum / stats[x][key].count;
            }

            stats[x][key].diff = null;
            if (stats[x][key].minval != null && stats[x][key].maxval != null) {
                stats[x][key].diff = stats[x][key].maxval - stats[x][key].minval;
            }

            if (stats[x][key].mean != null) {
                out += "<tr>";
                out += "<td style='text-align:left;'>" + feed_options[key].name + "</td>";

                var minval_str = "";
                if (stats[x][key].minval != null) minval_str = (1*stats[x][key].minval).toFixed(feed_options[key].dp) + " " + feed_options[key].unit;
                out += "<td style='text-align:center; color:#777'>" + minval_str + "</td>";

                var maxval_str = "";
                if (stats[x][key].maxval != null) maxval_str = (1*stats[x][key].maxval).toFixed(feed_options[key].dp) + " " + feed_options[key].unit;
                out += "<td style='text-align:center; color:#777'>" + maxval_str + "</td>";

                var diff_str = "";
                if (stats[x][key].diff != null) diff_str = (1*stats[x][key].diff).toFixed(feed_options[key].dp) + " " + feed_options[key].unit;
                out += "<td style='text-align:center; color:#777'>" + diff_str + "</td>";

                out += "<td style='text-align:center'>" + (1*stats[x][key].mean).toFixed(feed_options[key].dp) + " " + feed_options[key].unit + "</td>";

                if (feed_options[key].unit == "W") {
                    stats[x][key].kwh = (stats[x][key].mean * stats[x][key].count * view.interval) / 3600000;
                    out += "<td style='text-align:center'>" + (1*stats[x][key].kwh).toFixed(3) + " kWh</td>";
                } else {
                    out += "<td></td>";
                }
                out += "</tr>";
            }
        }

        $(".stats_category[key='" + x + "']").html(out);
    }
    
    // Standby energy
    var standby_kwh = stats['combined']['heatpump_elec'].kwh - stats['when_running']['heatpump_elec'].kwh;
    $("#standby_kwh").html(standby_kwh.toFixed(3));

    return stats;
}

// This takes a slightly different approach to the stats calculation above
// for cop calculation we need to make sure that it's only based on periods
// where electric and heat data are simultaneously available.
// We check here to make sure both elec and heat are not null and then 
// sum the kwh values before finally populating the COP fields.
function calculate_window_cops() {
    cop_stats = {};
    cop_stats.combined = {};
    cop_stats.when_running = {};
    cop_stats.space_heating = {};
    cop_stats.water_heating = {};
    
    for (var category in cop_stats) {
        cop_stats[category].elec_kwh = 0;
        cop_stats[category].heat_kwh = 0;
    }
    
    if (data["heatpump_elec"] != undefined && data["heatpump_heat"] != undefined) {
    
        var starting_power = parseFloat($("#starting_power").val());
    
        var dhw_enable = false;
        if (data["heatpump_dhw"] != undefined) dhw_enable = true;
        
        var power_to_kwh = view.interval / 3600000;
    
        for (var z in data["heatpump_elec"]) {
            let elec = data["heatpump_elec"][z][1];
            let heat = data["heatpump_heat"][z][1];

            let dhw = false;
            if (dhw_enable) dhw = data["heatpump_dhw"][z][1];
            
            if (elec != null && heat !=null) {
            
                cop_stats.combined.elec_kwh += elec * power_to_kwh;
                cop_stats.combined.heat_kwh += heat * power_to_kwh;
            
                if (elec >= starting_power) {
                    cop_stats.when_running.elec_kwh += elec * power_to_kwh;
                    cop_stats.when_running.heat_kwh += heat * power_to_kwh;

                    if (dhw_enable) {
                        if (dhw) {
                            cop_stats.water_heating.elec_kwh += elec * power_to_kwh;
                            cop_stats.water_heating.heat_kwh += heat * power_to_kwh;
                        } else {
                            cop_stats.space_heating.elec_kwh += elec * power_to_kwh;
                            cop_stats.space_heating.heat_kwh += heat * power_to_kwh;
                        }
                    }
                }
            }
        }
        
        for (var category in cop_stats) {
            if (cop_stats[category].elec_kwh>0) {
                let cop = cop_stats[category].heat_kwh / cop_stats[category].elec_kwh
                $(".cop_"+category).html(cop.toFixed(2));
                var tooltip_text = "Electric: " + cop_stats[category].elec_kwh.toFixed(1) + " kWh\nHeat: " + cop_stats[category].heat_kwh.toFixed(1) + " kWh\n";
                $(".cop_"+category).attr("title", tooltip_text);    
            } else {
                $(".cop_"+category).html("---");
            }
        }
        
        $("#window-cop").html($(".cop_combined").html());
        $("#window-cop").attr("title", $(".cop_combined").attr("title"));
        
    } else {
        $(".cop_combined").html("---");
        $(".cop_when_running").html("---");
        $(".cop_water_heating").html("---");
        $(".cop_space_heating").html("---");
    }
}

function stats_min_max(category, key, value) {

    if (stats[category][key].minval == null) {
        stats[category][key].minval = value;
    }
    if (value < stats[category][key].minval) {
        stats[category][key].minval = value;
    }
    if (stats[category][key].maxval == null) {
        stats[category][key].maxval = value;
    }
    if (value > stats[category][key].maxval) {
        stats[category][key].maxval = value;
    }
}

$(".show_stats_category").click(function () {
    var key = $(this).attr("key");
    var color = $(this).css("color");
    $(".stats_category").hide();
    $(".stats_category[key='" + key + "'").show();
    $(".show_stats_category").css("border-bottom", "none");
    $(this).css("border-bottom", "1px solid " + color);
});

function process_inst_cop() {

    var inst_cop_min = parseFloat($("#inst_cop_min").val());
    var inst_cop_max = parseFloat($("#inst_cop_max").val());

    powergraph_series['inst_cop'] = [];
    data["inst_COP"] = [];

    if (show_instant_cop) {
        if (data["heatpump_elec"] != undefined && data["heatpump_heat"] != undefined) {

            // foreach elec_without_null & heat_without_null find the COP 3 point average

            var np = inst_cop_mv_av_dp;

            for (var z = np; z < data["heatpump_elec"].length - np; z++) {
                var time = data["heatpump_elec"][z][0];

                // Extract values only once
                var elec_values = data["heatpump_elec"].slice(z - np, z + np + 1).map(entry => entry[1]);
                var heat_values = data["heatpump_heat"].slice(z - np, z + np + 1).map(entry => entry[1]);

                // Check for null values
                if (!elec_values.includes(null) && !heat_values.includes(null)) {
                    // Calculate sum directly
                    var elec_sum_inst = elec_values.reduce((sum, value) => sum + value, 0);
                    var heat_sum_inst = heat_values.reduce((sum, value) => sum + value, 0);

                    // Avoid division by zero
                    var cop = elec_sum_inst !== 0 ? heat_sum_inst / elec_sum_inst : null;
                    data["inst_COP"][z] = [time, cop];
                }
            }

            // filter out inst_COP values outside of range
            for (var z in data["inst_COP"]) {
                let inst_COP = data["inst_COP"][z][1];
                if (inst_COP > inst_cop_max) inst_COP = null;
                else if (inst_COP < inst_cop_min) inst_COP = null;
                data["inst_COP"][z][1] = inst_COP;
            }

            powergraph_series['inst_cop'] = { label: "Inst COP", data: data["inst_COP"], yaxis: 3, color: "#44b3e2", lines: { show: true, lineWidth: 2 } };
        }
    }
}

function emitter_and_volume_calculator() {
    $("#system_volume").html("?");
    $("#kW_at_50").html("?");

    if (!emitter_spec_enable) return false;

    if (stats['combined']["heatpump_flowT"] != undefined && stats['combined']["heatpump_returnT"] != undefined && stats['combined']["heatpump_roomT"] != undefined && stats['combined']['heatpump_heat'] != undefined) {

        if (stats['combined']["heatpump_flowT"].diff > 0.15 || stats['combined']["heatpump_returnT"].diff > 0.15) {
            $("#kW_at_50").html("?");

            if (kw_at_50_for_volume) {
                console.log("System volume calculation:");
                let MWT = (stats['combined']["heatpump_flowT"].mean + stats['combined']["heatpump_returnT"].mean) * 0.5;
                let MWT_minus_room = MWT - stats['combined']["heatpump_roomT"].mean;

                let heat_based_on_emitter_spec = kw_at_50_for_volume * 1000 * Math.pow(MWT_minus_room / 50, 1.3)
                let heat_to_system_volume = stats['combined']["heatpump_heat"].mean - heat_based_on_emitter_spec;

                let MWT_start = (stats['combined']["heatpump_flowT"].minval + stats['combined']["heatpump_returnT"].minval) * 0.5;
                let MWT_end = (stats['combined']["heatpump_flowT"].maxval + stats['combined']["heatpump_returnT"].maxval) * 0.5;
                let DT = MWT_end - MWT_start;
                if (DT > 0) {

                    let time_elapsed = (view.end - view.start) * 0.001
                    if (time_elapsed > 0) {
                        let DS_second = DT / time_elapsed;
                        let system_volume = heat_to_system_volume / (4200 * DS_second)

                        console.log("- heat output based on recorded emitter spec: " + heat_based_on_emitter_spec.toFixed(0) + "W");
                        console.log("- heat to system volume: " + heat_to_system_volume.toFixed(0) + "W");
                        console.log("- increase in temperature: " + DT.toFixed(1) + "K");
                        console.log("- increase in temperature per second: " + DS_second.toFixed(6) + "K/s");
                        console.log("- system volume: " + system_volume.toFixed(0) + " litres");
                        $("#system_volume").val(system_volume.toFixed(0));
                    }
                }
            }

        } else {
            let MWT = (stats['combined']["heatpump_flowT"].mean + stats['combined']["heatpump_returnT"].mean) * 0.5;
            let MWT_minus_room = MWT - stats['combined']["heatpump_roomT"].mean;
            kw_at_50 = 0.001 * stats['combined']["heatpump_heat"].mean / Math.pow(MWT_minus_room / 50, 1.3);

            console.log("Radiator spec calculation:");
            console.log("- mean water temperature: " + MWT.toFixed(1) + "C");
            console.log("- MWT - room: " + MWT_minus_room.toFixed(1) + "K");
            console.log("- heat output: " + stats['combined']["heatpump_heat"].mean.toFixed(0) + "W");
            console.log("- kw_at_50: " + kw_at_50.toFixed(1) + " kW");
            $("#kW_at_50").val(kw_at_50.toFixed(1));
        }
    } else {
        $("#kW_at_50").html("?");
    }
}

function compressor_starts() {

    var starting_power = parseFloat($("#starting_power").val());
    
    var state = null;
    var last_state = null;
    var starts = 0;
    var time_elapsed = 0;

    for (var z in data["heatpump_elec"]) {
        let elec = data["heatpump_elec"][z][1];
        
        if (elec !== null) {
        
            last_state = state;
            
            if (elec >= starting_power) {
                state = 1;
            } else {
                state = 0;
            }
            
            if (last_state===0 && state===1) {
                starts++;
            }
            
            time_elapsed += view.interval
        }
    }
        
    var hours = time_elapsed / 3600;
    
    var starts_per_hour = 0;
    if (hours>0) starts_per_hour = starts / hours;
    console.log("Starts: "+starts+", Starts per hour: "+starts_per_hour.toFixed(1)+", Hours: "+hours.toFixed(1));
}

// -------------------------------------------------------------------------------
// POWER GRAPH
// -------------------------------------------------------------------------------
function powergraph_draw() {
    set_url_view_params("power", view.start, view.end);

    var style = { size: flot_font_size, color: "#666" }
    var options = {
        lines: { fill: false },
        xaxis: {
            mode: "time", timezone: "browser",
            min: view.start, max: view.end,
            font: style,
            reserveSpace: false
        },
        yaxes: [
            { min: 0, font: style, reserveSpace: false },
            { font: style, reserveSpace: false },
            { min: 0, font: { size: flot_font_size, color: "#44b3e2" }, reserveSpace: false },
            { min: 0, max: 1, show: false, reserveSpace: false }
        ],
        grid: {
            show: true,
            color: "#aaa",
            borderWidth: 0,
            hoverable: true,
            clickable: true,
            // labelMargin:0,
            // axisMargin:0
            margin: { top: 30 }
        },
        selection: { mode: "x" },
        legend: { position: "NW", noColumns: 13 }
    }

    if (show_negative_heat) {
        options.yaxes[0].min = undefined;
    }

    if ($('#placeholder').width()) {
        // Remove keys
        var powergraph_series_without_key = [];
        for (var key in powergraph_series) {
            let show = true;
            if (key == 'heatpump_flowrate' && !show_flow_rate) show = false;

            if (show) powergraph_series_without_key.push(powergraph_series[key]);
        }
        $.plot($('#placeholder'), powergraph_series_without_key, options);
    }

    // show symbol when live scrolling is active
    var now = new Date().getTime();
    if (view.end > now - 5 * MINUTE && view.end <= now + 5 * MINUTE && view.end - view.start <= 2 * DAY) {
        $('#right').hide();
        $('#live').show();
    }
    else {
        $('#live').hide();
        $('#right').show();
    }
}

// -------------------------------------------------------------------------------
// BAR GRAPH
// -------------------------------------------------------------------------------
function bargraph_load(start, end) {
    var intervalms = DAY;
    end = Math.ceil(end / intervalms) * intervalms;
    start = Math.floor(start / intervalms) * intervalms;

    bargraph_series = [];

    var elec_kwh_in_window = 0;
    var heat_kwh_in_window = 0;
    var days_elec = 0;
    var days_heat = 0;

    if (heat_enabled) {
        data["heatpump_heat_kwhd"] = feed.getdata(feeds["heatpump_heat_kwh"].id, start, end, "daily", 0, 1)
        bargraph_series.push({
            data: data["heatpump_heat_kwhd"], color: 0,
            bars: { show: true, align: "center", barWidth: 0.75 * DAY, fill: 1.0, lineWidth: 0 }
        });

        for (var z in data["heatpump_heat_kwhd"]) {
            heat_kwh_in_window += data["heatpump_heat_kwhd"][z][1];
            days_heat++;
        }
    }

    if (elec_enabled) {
        data["heatpump_elec_kwhd"] = feed.getdata(feeds["heatpump_elec_kwh"].id, start, end, "daily", 0, 1);
        bargraph_series.push({
            data: data["heatpump_elec_kwhd"], color: 1,
            bars: { show: true, align: "center", barWidth: 0.75 * DAY, fill: 1.0, lineWidth: 0 }
        });

        for (var z in data["heatpump_elec_kwhd"]) {
            elec_kwh_in_window += data["heatpump_elec_kwhd"][z][1];
            days_elec++;
        }

        // add series that shows COP points for each day
        if (heat_enabled) {
            if ((end - start) < 120 * DAY) {
                cop_data = [];
                for (var z in data["heatpump_elec_kwhd"]) {
                    time = data["heatpump_elec_kwhd"][z][0];
                    elec = data["heatpump_elec_kwhd"][z][1];
                    heat = data["heatpump_heat_kwhd"][z][1];
                    if (elec && heat) {
                        cop_data[z] = [time, heat / elec];
                    }
                }
                bargraph_series.push({
                    data: cop_data, color: "#44b3e2", yaxis: 3,
                    points: { show: true }
                });
            }
        }
    }

    if (feeds["heatpump_outsideT"] != undefined) {

        if ((end - start) < 120 * DAY) {
            data["heatpump_outsideT_daily"] = feed.getdata(feeds["heatpump_outsideT"].id, start, end, "daily", 1, 0);
            bargraph_series.push({
                data: data["heatpump_outsideT_daily"], color: 4, yaxis: 2,
                lines: { show: true, align: "center", fill: false }, points: { show: false }
            });
        }
    }

    var cop_in_window = heat_kwh_in_window / elec_kwh_in_window;
    if (cop_in_window < 0) cop_in_window = 0;
    $("#window-cop").html((cop_in_window).toFixed(2));

    var tooltip_text = "";
    tooltip_text += "Electric: " + elec_kwh_in_window.toFixed(0) + " kWh (" + (elec_kwh_in_window / days_elec).toFixed(1) + " kWh/d)\n";
    tooltip_text += "Heat: " + heat_kwh_in_window.toFixed(0) + " kWh (" + (heat_kwh_in_window / days_heat).toFixed(1) + " kWh/d)\n";
    tooltip_text += "Days: " + days_elec;
    $("#window-cop").attr("title", tooltip_text);

    $("#window-carnot-cop").html("");

    set_url_view_params('daily', start, end);
}

function bargraph_draw() {
    var options = {
        xaxis: {
            mode: "time",
            timezone: "browser",
            font: { size: flot_font_size, color: "#666" },
            // labelHeight:-5
            reserveSpace: false
        },
        yaxes: [{
            font: { size: flot_font_size, color: "#666" },
            // labelWidth:-5
            reserveSpace: false,
            min: 0
        }, {
            font: { size: flot_font_size, color: "#9440ed" },
            // labelWidth:-5
            reserveSpace: false,
            // max:40
        }, {
            font: { size: flot_font_size, color: "#44b3e2" },
            reserveSpace: false,
            min: 0
        }],
        selection: { mode: "x" },
        grid: {
            show: true,
            color: "#aaa",
            borderWidth: 0,
            hoverable: true,
            clickable: true
        }
    }
    if ($('#placeholder').width()) {
        var plot = $.plot($('#placeholder'), bargraph_series, options);
        $('#placeholder').append("<div id='bargraph-label' style='position:absolute;left:50px;top:30px;color:#666;font-size:12px'></div>");
    }
}

// -------------------------------------------------------------------------------
// RESIZE
// -------------------------------------------------------------------------------

function resize() {
    var window_width = $(this).width();

    flot_font_size = 12;
    if (window_width < 450) flot_font_size = 10;

    var top_offset = 0;
    var placeholder_bound = $('#placeholder_bound');
    var placeholder = $('#placeholder');

    var width = placeholder_bound.width();
    var height = width * 0.6;
    if (height < 250) height = 250;
    if (height > 480) height = 480;
    if (height > width) height = width;

    placeholder.width(width);
    placeholder_bound.height(height);
    placeholder.height(height - top_offset);

    if (viewmode == "bargraph") {
        bargraph_draw();
    } else {
        powergraph_draw();
    }
}
// on finish sidebar hide/show
$(function () {
    $(document).on('window.resized hidden.sidebar.collapse shown.sidebar.collapse', resize)
})
// ----------------------------------------------------------------------
// App log
// ----------------------------------------------------------------------
function app_log(level, message) {
    if (level == "ERROR") alert(level + ": " + message);
    console.log(level + ": " + message);
}

// Remove null values from feed data
function remove_null_values(data, interval) {
    var last_valid_pos = 0;
    for (var pos = 0; pos < data.length; pos++) {
        if (data[pos][1] != null) {
            let null_time = (pos - last_valid_pos) * interval;
            if (null_time < 900) {
                for (var x = last_valid_pos + 1; x < pos; x++) {
                    data[x][1] = data[last_valid_pos][1];
                }
            }
            last_valid_pos = pos;
        }
    }
    return data;
}

function set_url_view_params(mode, start, end) {
    const url = new URL(window.location);
    url.searchParams.set('mode', mode);
    url.searchParams.set('start', Math.round(start * 0.001));
    url.searchParams.set('end', Math.round(end * 0.001));
    url.searchParams.delete('hours');

    if (show_instant_cop) url.searchParams.set('cop', 1);
    else url.searchParams.delete('cop');

    if (show_flow_rate) url.searchParams.set('flow', 1);
    else url.searchParams.delete('flow');

    if (show_negative_heat) url.searchParams.set('cool', 1);
    else url.searchParams.delete('cool');

    if ($("#carnot_enable")[0].checked) url.searchParams.set('carnot', parseFloat($("#heatpump_factor").val()));
    else url.searchParams.delete('carnot');

    $('#permalink')[0].href = url.toString();
}

function draw_histogram(histogram) {

    var keys = [];
    for (k in histogram) {
        if (histogram.hasOwnProperty(k)) {
            keys.push(k * 1);
        }
    }
    keys.sort();

    var sorted_histogram = []
    for (var z in keys) {
        sorted_histogram.push([keys[z], histogram[keys[z]]])
    }

    var options = {
        // lines: { fill: true },
        bars: { show: true, align: "center", barWidth: (1 / 200) * 0.8, fill: 1.0, lineWidth: 0 },
        xaxis: {
            // mode: "time", timezone: "browser", 
            min: 0.2, max: 0.8,
            font: { size: flot_font_size, color: "#666" },
            reserveSpace: false
        },
        yaxes: [
            //{ min: 0,font: {size:flot_font_size, color:"#666"},reserveSpace:false},
            { font: { size: flot_font_size, color: "#666" }, reserveSpace: false }
        ],
        grid: {
            show: true,
            color: "#aaa",
            borderWidth: 0,
            hoverable: true,
            clickable: true,
            // labelMargin:0,
            // axisMargin:0
            margin: { top: 30 }
        },
        //selection: { mode: "x" },
        legend: { position: "NW", noColumns: 6 }
    }
    if ($('#histogram').width() > 0) {
        $.plot($('#histogram'), [{ data: sorted_histogram }], options);
    }
}

$('#histogram').bind("plothover", function (event, pos, item) {
    if (item) {
        var z = item.dataIndex;

        if (previousPoint != item.datapoint) {
            previousPoint = item.datapoint;

            $("#tooltip").remove();

            var itemTime = item.datapoint[0];
            var itemValue = item.datapoint[1];
            tooltip(item.pageX, item.pageY, item.datapoint[0] + ": " + (item.datapoint[1]).toFixed(3) + " kWh", "#fff", "#000");

        }
    } else $("#tooltip").remove();
});

$("#show_flow_rate").click(function () {
    if ($("#show_flow_rate")[0].checked) {
        show_flow_rate = true;
    } else {
        show_flow_rate = false;
    }
    powergraph_draw();
});

$("#show_negative_heat").click(function () {
    if ($("#show_negative_heat")[0].checked) {
        show_negative_heat = true;
    } else {
        show_negative_heat = false;
    }
    powergraph_draw();
});

$("#show_instant_cop").click(function () {

    if ($("#show_instant_cop")[0].checked) {
        show_instant_cop = true;
        $("#inst_cop_options").show();
    } else {
        show_instant_cop = false;
        $("#inst_cop_options").hide();
    }

    powergraph_process();
});

$("#inst_cop_min").change(function () {
    inst_cop_min = parseInt($("#inst_cop_min").val());
    powergraph_process();
});

$("#inst_cop_max").change(function () {
    inst_cop_max = parseInt($("#inst_cop_max").val());
    powergraph_process();
});

$("#inst_cop_mv_av_dp").change(function () {
    inst_cop_mv_av_dp = parseInt($("#inst_cop_mv_av_dp").val());
    powergraph_process();
});

$("#realtime_cop_div").click(function () {
    if (realtime_cop_div_mode == "30min") {
        realtime_cop_div_mode = "inst";
        $("#realtime_cop_title").html("COP Now");
        $("#realtime_cop_value").html("---");
    } else {
        realtime_cop_div_mode = "30min";
        $("#realtime_cop_title").html("COP 30mins");
        $("#realtime_cop_value").html("---");
        progtime = 0;
    }
    updater();
});

$("#emitter_spec_enable").click(function () {
    if ($("#emitter_spec_enable")[0].checked) {
        emitter_spec_enable = true;
        $("#emitter_spec_options").show();
    } else {
        emitter_spec_enable = false;
        $("#emitter_spec_options").hide();
    }
    powergraph_process();
});

$("#use_for_volume_calc").click(function () {
    kw_at_50_for_volume = kw_at_50;
});

$("#configure_standby").click(function () {
    if ($("#configure_standby")[0].checked) {
        $("#configure_standby_options").show();
    } else {
        $("#configure_standby_options").hide();
    }
});
