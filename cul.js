/* jshint -W097 */// jshint strict:false
/*jslint node: true */

var Cul = require('cul');
'use strict';

// you have to require the utils module and call adapter function
var utils = require(__dirname + '/lib/utils'); // Get common adapter utils

var cul;
var objects   = {};
var metaRoles = {};
var SerialPort;

var adapter = utils.adapter('cul');

try {
    SerialPort = require('serialport');//.SerialPort;
} catch (e) {
    console.warn('Serial port is not available');
}


adapter.on('stateChange', function (id, state) {
    //if (cul) cul.cmd();
});

adapter.on('unload', function (callback) {
    if (cul) {
        try {
            cul.close();
        } catch (e) {
            adapter.log.error('Cannot close serial port: ' + e.toString());
        }
    }
    callback();
});

adapter.on('ready', function () {
    checkPort(function (err) {
        if (!err) {
            main();
        } else {
            adapter.log.error('Cannot open port: ' + err);
        }
    });
});

adapter.on('message', function (obj) {
    if (obj) {
        switch (obj.command) {
            case 'listUart':
                if (obj.callback) {
                    if (SerialPort) {
                        // read all found serial ports
                        SerialPort.list(function (err, ports) {
                            adapter.log.info('List of port: ' + JSON.stringify(ports));
                            adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                        });
                    } else {
                        adapter.log.warn('Module serialport is not available');
                        adapter.sendTo(obj.from, obj.command, [{comName: 'Not available'}], obj.callback);
                    }
                }

                break;
        }
    }
});

function checkPort(callback) {
    if (!adapter.config.serialport) {
        if (callback) callback('Port is not selected');
        return;
    }

    try {
        var sPort = new SerialPort(adapter.config.serialport || '/dev/ttyACM0', {
            baudrate: parseInt(adapter.config.baudrate, 10) || 9600
        });
        sPort.on('error', function (err) {
            if (callback) callback(err);
            callback = null;
        });
        setTimeout(function () {
            if (callback) {
                sPort.open(function (err) {
                    if (!err) {
                        try {
                            sPort.close();
                        } catch (e) {
                            if (callback) callback(e);
                            callback = null;
                        }
                    }
                    if (callback) callback(err);
                    callback = null;
                });
            }
        }, 500);

    } catch (e) {
        adapter.log.error('Cannot open port: ' + e);
        try {
            sPort.close();
        } catch (ee) {

        }
        if (callback) callback(e);
    }
}

function main() {
    var options = {
        serialport: adapter.config.serialport || '/dev/ttyACM0',
        mode:       adapter.config.mode       || 'SlowRF',
        baudrate:   parseInt(adapter.config.baudrate, 10) || 9600,
        scc:        adapter.config.type === 'scc',
        coc:        adapter.config.type === 'coc'
    };

    cul = new Cul(options);

    adapter.objects.getObject('cul.meta.roles', function (err, res) {
        metaRoles = res.native;
        adapter.objects.getObjectView('cul', 'devices', function (err, res) {
            for (var i = 0, l = res.total_rows; i < l; i++) {
                objects[res.rows[i].id] = res.rows[i].value;
            }
            receive();
        });
    });

    cul.on('close', function () {
        adapter.states.setState('system.adapter.' + adapter.namespace + '.connected', {val: false, ack: true});
    });

    cul.on('ready', function () {
        adapter.states.setState('system.adapter.' + adapter.namespace + '.connected', {val: true, ack: true});
    });

    function insertObjects(objs) {
        if (objs.length < 1) {
            return;
        } else {
            var newObject = objs.pop();
            adapter.setObject(newObject._id, newObject, function (err, res) {
                adapter.log.info('object ' + adapter.namespace + '.' + newObject._id + ' created');
                setTimeout(insertObjects, 0, objs);
            });
        }
    }

    function receive() {
        cul.on('data', function (raw, obj) {
            if (!obj || !obj.protocol || !obj.address) return;
            var id = obj.protocol + '.' + obj.address;

            for (var state in obj.data) {
                adapter.setState(id + '.' + state, {val: obj.data[state], ack: true});
            }

            if (!objects[id]) {
                var newObjects = [];
                var tmp = JSON.parse(JSON.stringify(obj));
                delete tmp.data;
                var newDevice = {
                    _id:    id,
                    type:   'device',
                    common: {
                        name: obj.device + ' ' + obj.address
                    },
                    native: tmp
                };
                for (var _state in obj.data) {
                    if (!obj.data.hasOwnProperty(_state)) continue;
                    var common = {};

                    if (metaRoles[obj.device + '_' + _state]) {
                        common = metaRoles[obj.device + '_' + _state];
                    } else if (metaRoles[_state]) {
                        common = metaRoles[_state];
                    }

                    common.name = _state + ' ' + obj.device + ' ' + id;

                    var newState = {
                        _id:    id + '.' + _state,
                        type:   'state',
                        common: common,
                        native: {}
                    };

                    objects[id + '.' + _state] = newState;
                    newObjects.push(newState);
                }
                objects[id] = newDevice;
                newObjects.push(newDevice);

                insertObjects();
            }
        });
    }
}


