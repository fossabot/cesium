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

    
    var RialtoPointCloudTile = function RialtoPointCloudTile(provider, level, x, y) {
        this._provider = provider;
        this._x = x;
        this._y = y;
        this._level = level;

        this._primitive = undefined;
        this.url = this._provider._url + "/" + level + "/" + x + "/" + y;
        this._name = "[" + level + "/" + x + "/" + y + "]";
        this.dimensions = undefined; // list of arrays of dimension data

        this.swExists = false;
        this.seExists = false;
        this.nwExists = false;
        this.neExists = false;
        this._childTileMask = undefined;

        this._ready = false;
    }


    Object.defineProperties(RialtoPointCloudTile.prototype, {
        ready : {
            get : function () {
                "use strict";
                //console.log("ready check" + this._ready);
                return this._ready;
            }
        },
        primitive : {
            get : function () {
                "use strict";
                //console.log("ready check" + this._ready);
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
        }
    });


    // sets this.ready when done
    RialtoPointCloudTile.prototype.load = function() {
       "use strict";

        //console.log("loading tile: " + this.url);

        var that = this;

        loadBlob(this.url).then(function (blob) {
            //console.log("got blob for " + that.name + ", size=" + blob.size);

            if (blob.size == 0) {
                throw new DeveloperError("Rialto Error: returned blob for tile has length zero");
            }
            if (blob.size < 8) {
                throw new DeveloperError("Rialto Error: returned blob for tile is too short: " + blob.size + " bytes");
            }

            var reader = new FileReader();
            reader.addEventListener("loadend", function () {
                var buffer = reader.result;
                that._loadFromBuffer(buffer);
                that.colorize();
                that._primitive = that.createPrimitive(that.numPoints, that.dimensions);
                that._ready = true;
                //console.log("ready: " + that.name);
            });
            reader.readAsArrayBuffer(blob);

        }).otherwise(function () {
            throw new DeveloperError("Rialto Error: failed to read point cloud tile: " + this.url);
        });
    }


    RialtoPointCloudTile.prototype._loadFromBuffer = function (buffer) {
        "use strict";

        var level = this.level;
        var x = this.x;
        var y = this.y;

        if (buffer == null) {
            throw new DeveloperError("Rialto Error: buffer null: " + name);
        }

        // first 4 bytes is number of points
        // next 4 bytes is mask
        // remaining bytes are the points

        var uints = new Uint32Array(buffer, 0, 2);
        var numUints = uints.length;

        var numPoints = uints[0];
        var mask = uints[1];
        this._setChildren(mask);

        var bytes = new Uint8Array(buffer, 8);
        var numBytes = bytes.length;
        //console.log("num bytes in point data=" + numBytes);

        if (numBytes > 0) {
            var dv = new DataView(buffer, 8, numBytes);
            this._createDimensionArrays(dv, numBytes);
        } else {
            this._createDimensionArrays(null, 0);
        }
    };


    RialtoPointCloudTile.prototype._createDimensionArrays = function (dataview, numBytes) {
        "use strict";

        var headerDims = this._provider.header.dimensions;
        var i;
        var datatype,
            offset,
            stride,
            name,
            v;

        var pointSize = this._provider.header.pointSizeInBytes;

        if (numBytes == 0) {
            this.numPoints = 0;
        } else {
            this.numPoints = numBytes / pointSize;
            if (this.numPoints * pointSize != numBytes) {
                throw new DeveloperError("Rialto Error: wrong num points");
            }
        }

        this.dimensions = {};

        //console.log("num points in tile: " + this.numPoints);

        for (i = 0; i < headerDims.length; i += 1) {
            datatype = headerDims[i].datatype;
            offset = headerDims[i].offset;
            name = headerDims[i].name;
            stride = pointSize;

            if (this.numPoints == 0) {
                v = null;
            } else {
                v = this._extractDimensionArray(dataview, datatype, offset, stride, this.numPoints);
            }
            this.dimensions[name] = v;
        }

       // this is the array used to colorize each point
        var rgba = new Uint8Array(this.numPoints * 4);
        for (i = 0; i < this.numPoints * 4; i += 1) {
            rgba[i] = 255;
        }
        name = "rgba";
        this.dimensions[name] = rgba;
    };


    // Dataview is an array-of-structs: x0, y0, z0, t0, x1, y1, ...
    // Create an array of all the elements from one of the struct fields
    RialtoPointCloudTile.prototype._extractDimensionArray = function (dataview, datatype, offset, stride, len) {
        "use strict";

        var dst, dstIndex, dvIndex;

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

        this._childTileMask = mask;

        if ((mask & 1) == 1) {
            // (level + 1, 2 * x, 2 * y + 1);
            this.swExists = true;
        }
        if ((mask & 2) == 2) {
            // (level + 1, 2 * x + 1, 2 * y + 1);
            this.seExists = true;
        }
        if ((mask & 4) == 4) {
            // (level + 1, 2 * x + 1, 2 * y);
            this.neExists = true;
        }
        if ((mask & 8) == 8) {
            // (level + 1, 2 * x, 2 * y);
            this.nwExists = true;
        }
    }


    // taken from Cartesian3.fromDegreesArrayHeights
    RialtoPointCloudTile.prototype.Cartesian3_fromDegreesArrayHeights_merge = function (x, y, z, cnt, ellipsoid) {
        "use strict";

        if (cnt != this.numPoints) {
            throw new DeveloperError("Rialto Error: wrong num points");
        }

        var xyz = new Float64Array(cnt * 3);

        var i;
        var lon, lat, alt, result;
        for (i = 0; i < cnt; i++) {
            lon = Math.toRadians(x[i]);
            lat = Math.toRadians(y[i]);
            alt = z[i];

            result = Cartesian3.fromRadians(lon, lat, alt, ellipsoid);

            xyz[i*3] = result.x;
            xyz[i*3+1] = result.y;
            xyz[i*3+2] = result.z;
        }

        return xyz;
    };


    // x,y,z as F64 arrays
    // rgba as U8 array
    RialtoPointCloudTile.prototype.createPrimitive = function (cnt, dims) {
        "use strict";

        if (cnt == 0) {
            return null;
        }

        var x = dims["X"];
        var y = dims["Y"];
        var z = dims["Z"];
        var rgba = dims["rgba"];

        var xyz = this.Cartesian3_fromDegreesArrayHeights_merge(x, y, z, cnt);

        if (this.numPoints != cnt) {
            throw new DeveloperError("Rialto Error: bad point count / createPrimitive");
        }
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
            id : 'point'
        });

        var prim = new Primitive({
            geometryInstances : [pointInstance],
            appearance : new PointAppearance()
        });

        return prim;
    };


    RialtoPointCloudTile.prototype.colorize = function () {

        var headerDims = this._provider.header.dimensions;
        var min, max;
        for (var i=0; i<headerDims.length; i++) {
            if (headerDims[i].name == this._provider.colorizeDimension) {
                min = headerDims[i].min;
                max = headerDims[i].max;
                break;
            }
        }

        var nam = this._provider.colorizeDimension;
        var dataArray = this.dimensions[nam];
        var rgba = "rgba";
        var rgbaArray = this.dimensions[rgba];

        var colorizer = new RialtoPointCloudColorizer();
        colorizer.run(this._provider.rampName, dataArray, this.numPoints, min, max, rgbaArray);
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
