var Cul = require('cul');

var cul;
var objects = {};
var metaRoles = {};

var adapter = require(__dirname + '/../../lib/adapter.js')({

    name:           'cul',

    objectChange: function (id, obj) {

    },

    stateChange: function (id, state) {

    },

    unload: function (callback) {
        if (cul) cul.close();
        callback();
    },

    ready: function () {

        var options = {
            serialport:     adapter.config.serialport   || '/dev/ttyACM0',
            baudrate:       adapter.config.baudrate     || 9600,
            mode:           adapter.config.mode         || 'SlowRF'
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

        function receive() {
            cul.on('data', function (raw, obj) {
                if (!obj || !obj.protocol || !obj.address) return;
                var id = obj.protocol + '.' + obj.address;

                for (var state in obj.data) {
                    adapter.setState(id + '.' + state, {val:obj.data[state], ack: true});
                }

                if (!objects[id]) {
                    var newObjects = [];
                    var tmp = JSON.parse(JSON.stringify(obj));
                    delete tmp.data;
                    var newDevice = {_id: id, type: 'device', common: {name: obj.device + ' ' + obj.address}, native: tmp, children: []};
                    for (var state in obj.data) {
                        var common = {};

                        if (metaRoles[obj.device + '_' + state]) {
                            common = metaRoles[obj.device + '_' + state];
                        } else if (metaRoles[state]) {
                            common = metaRoles[state];
                        }

                        common.name = state + ' ' + obj.device + ' ' + id;

                        newDevice.children.push(adapter.namespace + '.' + id + '.' + state);
                        var newState = {
                            _id: id + '.' + state,
                            type: 'state',
                            parent: adapter.namespace + '.' + id,
                            common: common,
                            native: {}
                        };
                        objects[id + '.' + state] = newState;
                        newObjects.push(newState);
                    }
                    objects[id] = newDevice;
                    newObjects.push(newDevice);


                    function insertObjects() {
                        if (newObjects.length < 1) {
                            return;
                        } else {
                            var newObject = newObjects.pop();
                            adapter.setObject(newObject._id, newObject, function (err, res) {
                                adapter.log.info('object ' + adapter.namespace + '.' + newObject._id + ' created');
                                insertObjects();
                            });
                        }
                    }

                    insertObjects();


                }



            });
        }

    }

});

