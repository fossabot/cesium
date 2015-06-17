/*
Copyright (c) 2014-2015 RadiantBlue Technologies, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

define([
        '../Cesium',
        '../Core/loadBlob',
        '../Core/Cartesian3',
        '../Core/GeometryInstance',
        '../Core/Math',
        '../Core/PointGeometry',
        '../Scene/PointAppearance',
        '../Scene/Primitive',
        '../Scene/RialtoPointCloudColorizer'
    ], function(
        Cesium,
        loadBlob,
        Cartesian3,
        GeometryInstance,
        Math,
        PointGeometry,
        PointAppearance,
        Primitive,
        RialtoPointCloudColorizer
    ) {
    "use strict";

    // ctor
    //
    // provider: the RialtoPointCloudProvider for this tile
    //
    // level (int): the resolution level of this tile
    // x: the col number of this tile
    // y: the row number of this tile
    var RialtoPointCloudTile = function RialtoPointCloudTile(provider, level, x, y) {

        this._provider = provider;
        this._x = x;
        this._y = y;
        this._level = level;

        this._numPoints = undefined;
        
        this._primitive = undefined;
        
        this._name = level + "/" + x + "/" + y;
        this._url = this._provider._url + "/" + this._name;
        
        this.dimensions = undefined; // map from dimension name to data array

        // the child tiles
        this.swExists = false;
        this.seExists = false;
        this.nwExists = false;
        this.neExists = false;

        this._ready = false;
    }


    Object.defineProperties(RialtoPointCloudTile.prototype, {
        ready : {
            get : function () {
                "use strict";
                return this._ready;
            }
        },
        primitive : {
            get : function () {
                "use strict";
                return this._primitive;
            }
        },
        level : {
            get : function () {
                "use strict";
                return this._level;
            }
        },
        x : {
            get : function () {
                "use strict";
                return this._x;
            }
        },
        y : {
            get : function () {
                "use strict";
                return this._y;
            }
        },
        name : {
            get : function () {
                "use strict";
                return this._name;
            }
        },
        header : {
            get : function () {
                "use strict";
                return this._provider.header;
            }
        },
        numPoints : {
            get : function () {
                "use strict";
                return this._numPoints;
            }
        }
    });


    // Loads the points from the database/server for this tile.
    //
    // Sets this.ready when done
    RialtoPointCloudTile.prototype.load = function() {
       "use strict";

        var that = this;

        // get the blob from the server
        loadBlob(this._url).then(function (blob) {

            if (blob.size == 0) {
                throw new DeveloperError("Rialto Error: returned blob for tile has length zero");
            }
            if (blob.size < 8) {
                throw new DeveloperError("Rialto Error: returned blob for tile is too short: " + blob.size + " bytes");
            }

            // copy the returned blob into our local points structure
            // (this.dimensions), colorize the rgba dimension, and create
            // the Cesium primitive
            var reader = new FileReader();
            reader.addEventListener("loadend", function () {
                var buffer = reader.result;
                that._loadFromBuffer(buffer);
                that._colorize();
                that._primitive = that._createPrimitive();
                that._ready = true;
            });
            reader.readAsArrayBuffer(blob);

        }).otherwise(function () {
            throw new DeveloperError("Rialto Error: failed to read point cloud tile: " + this._url);
        });
    }


    RialtoPointCloudTile.prototype._loadFromBuffer = function (buffer) {
        "use strict";

        if (buffer == null) {
            throw new DeveloperError("Rialto Error: buffer null: " + name);
        }

        var level = this.level;
        var x = this.x;
        var y = this.y;

        // The server's returned blob:
        //   first 4 bytes is number of points
        //   next 4 bytes is children mask
        //   remaining bytes are the points, in xyzxyzxyz order

        var two_uints = new Uint32Array(buffer, 0, 2);

        this._numPoints = two_uints[0];
        this._setChildren(two_uints[1]);

        var bytes = new Uint8Array(buffer, 8);
        var numBytes = bytes.length;

        if (numBytes > 0) {
            // make our local copy of the points
            var dv = new DataView(buffer, 8, numBytes);
            this._createDimensionArrays(dv, numBytes);
        } else {
            // we have an empty tile
            this._createDimensionArrays(null, 0);
        }
    };


    // Given an array of bytes in xyzxyzxyz order, pull out each dimension of
    // each point and store it in our local dimensions map as the right type.
    RialtoPointCloudTile.prototype._createDimensionArrays = function (dataview, numBytes) {
        "use strict";

        var headerDims = this._provider.header.dimensions;
        var i;
        var datatype,
            offset,
            name,
            v;

        var pointSize = this._provider.header.pointSize;

        if (this.numPoints * pointSize != numBytes) {
            throw new DeveloperError("Rialto Error: wrong num points");
        }

        this.dimensions = {};
        
        for (i = 0; i < headerDims.length; i += 1) {
            datatype = headerDims[i].datatype;
            offset = headerDims[i].offset;
            name = headerDims[i].name;

            if (this.numPoints == 0) {
                v = null;
            } else {
                v = this._extractDimensionArray(dataview, datatype, offset, pointSize, this.numPoints);
            }
            this.dimensions[name] = v;
        }

        // this is the "special dimension", the array used to hold the color of each point
        // we default to white, unless and until colorize() changes it
        var rgba = new Uint8Array(this.numPoints * 4);
        for (i = 0; i < this.numPoints * 4; i += 1) {
            rgba[i] = 255;
        }
        this.dimensions["rgba"] = rgba;
    };


    // Dataview is an array-of-structs: [x0, y0, z0, t0, x1, y1, ...]
    // Create an array of all the elements from one of the struct fields, e.g. [y0, y1, ...]
    RialtoPointCloudTile.prototype._extractDimensionArray = function (dataview, datatype, offset, stride, len) {
        "use strict";

        var dst, dstIndex, dvIndex;

        // note we keep the datatype test outside the loop, to potentially
        // help performance
        
        switch (datatype) {
        case "uint8_t":
            dst = new Uint8Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getUint8(dvIndex);
            }
            break;
        case "int8_t":
            dst = new Int8Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getInt8(dvIndex);
            }
            break;
        case "uint16_t":
            dst = new Uint16Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getUint16(dvIndex, true);
            }
            break;
        case "int16_t":
            dst = new Int16Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getInt16(dvIndex, true);
            }
            break;
        case "uint32_t":
            dst = new Uint32Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getUint32(dvIndex, true);
            }
            break;
        case "int32_t":
            dst = new Int32Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getInt32(dvIndex, true);
            }
            break;
        case "uint64_t":
            dst = new Uint64Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getUint64(dvIndex, true);
            }
            break;
        case "int64_t":
            dst = new Int64Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getInt64(dvIndex, true);
            }
            break;
        case "float":
            dst = new Float32Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getFloat32(dvIndex, true);
            }
            break;
        case "double":
            dst = new Float64Array(len);
            for (dstIndex = 0, dvIndex = offset; dstIndex < len; dstIndex += 1, dvIndex += stride) {
                dst[dstIndex] = dataview.getFloat64(dvIndex, true);
            }
            break;
        default:
            throw new DeveloperError("Rialto Error: invalid datatype / notreached");
            break;
        }
        return dst;
    };


    RialtoPointCloudTile.prototype._setChildren = function (mask) {
        this.swExists = ((mask & 1) == 1);
        this.seExists = ((mask & 2) == 2);
        this.neExists = ((mask & 4) == 4);
        this.nwExists = ((mask & 8) == 8);
    }


    // Given three arrays of cartographic triples, construct a single array
    // of cartesian triples.
    //
    // (taken from Cartesian3.fromDegreesArrayHeights)
    var _Cartesian3_fromDegreesArrayHeights_merge = function (x, y, z, cnt, ellipsoid) {
        "use strict";

        var xyz = new Float64Array(cnt * 3);

        var i;
        var lon, lat, result;
        
        for (i = 0; i < cnt; i++) {
            lon = Math.toRadians(x[i]);
            lat = Math.toRadians(y[i]);

            result = Cartesian3.fromRadians(lon, lat, z[i], ellipsoid);

            xyz[i*3] = result.x;
            xyz[i*3+1] = result.y;
            xyz[i*3+2] = result.z;
        }

        return xyz;
    };


    // x,y,z are presumed to be F64 arrays
    // rgba is presumed to an U8 array
    RialtoPointCloudTile.prototype._createPrimitive = function () {
        "use strict";

        var cnt = this.numPoints;
        var dims = this.dimensions;
        
        if (cnt == 0) {
            return null;
        }

        var x = dims["X"];
        var y = dims["Y"];
        var z = dims["Z"];
        var rgba = dims["rgba"];

        var xyz = _Cartesian3_fromDegreesArrayHeights_merge(x, y, z, cnt);

        if (xyz.length != cnt * 3) {
            throw new DeveloperError("Rialto Error: bad xyz point count / createPrimitive");
        }
        if (rgba.length != cnt * 4) {
            throw new DeveloperError("Rialto Error: bad rgba point count / createPrimitive");
        }

        var pointInstance = new GeometryInstance({
            geometry : new PointGeometry({
                positionsTypedArray: xyz,
                colorsTypedArray: rgba
            }),
            id : this.name
        });

        var prim = new Primitive({
            geometryInstances : [pointInstance],
            appearance : new PointAppearance()
        });

        return prim;
    };


    // colorize the colorization dimension, using the scaling info
    // from the header
    //
    // The special "rgba" dimension is what we're going to display.
    RialtoPointCloudTile.prototype._colorize = function () {
        
        if (this._provider.colorizer.rampName == undefined ||
            this._provider.colorizer.dimensionName == undefined) {
            // skip the colorization, leave as white
            return;
        }
        
        var headerDims = this._provider.header.dimensions;
        var min, max;
        for (var i=0; i<headerDims.length; i++) {
            if (headerDims[i].name == this._provider.colorizer.dimensionName) {
                min = headerDims[i].minimum;
                max = headerDims[i].maximum;
                break;
            }
        }

        var dataArray = this.dimensions[this._provider.colorizer.dimensionName];
        var rgbaArray = this.dimensions["rgba"];

        this._provider.colorizer.run(dataArray, this.numPoints, min, max, rgbaArray);
    }


    RialtoPointCloudTile.prototype.isChildAvailable = function(parentX, parentY, childX, childY) {

        if (childX == parentX * 2) {
            if (childY == parentY * 2) return this.nwExists;
            if (childY == parentY * 2 + 1) return this.swExists;
        } else if (childX == parentX * 2 + 1) {
            if (childY == parentY * 2) return this.neExists;
            if (childY == parentY * 2 + 1) return this.seExists;
        }

        return false;
    };


    return RialtoPointCloudTile;
});
