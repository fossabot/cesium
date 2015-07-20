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
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/loadJson',
        '../Core/BoundingSphere',
        '../Core/DeveloperError',
        '../Core/Cartesian3',
        '../Core/Event',
        '../Core/GeographicTilingScheme',
        '../Scene/QuadtreeTileLoadState',
        '../Scene/QuadtreeTileProvider',
        '../Scene/RialtoPointCloudColorizer',
        '../Scene/RialtoPointCloudTile',
        '../Scene/SceneMode',
        '../ThirdParty/when'
    ], function(
        Cesium,
        defined,
        defineProperties,
        destroyObject,
        loadJson,
        BoundingSphere,
        DeveloperError,
        Cartesian3,
        Event,
        GeographicTilingScheme,
        QuadtreeTileLoadState,
        QuadtreeTileProvider,
        RialtoPointCloudColorizer,
        RialtoPointCloudTile,
        SceneMode,
        when
    ) {
    "use strict";


    // ctor
    //
    // url (string): name of a table in a Rialto GeoPackage tile server
    //   example: "http://example.com/rialto/geopackagefile/tablename"
    //
    // colorizerRamp (string): name of color scheme (see RialtoPointCloudColorizer)
    //   example: "Spectral"
    //   if undefined, will just make the point white at position (x,y,z)
    //
    // colorizerDimension (string): name of the dimension to displayed as the point cloud
    //   example: "Z"
    //   if undefined, will just make the point white at position (x,y,z)
    var RialtoPointCloudProvider = function RialtoPointCloudProvider(url, colorizerRampName, colorizerDimensionName, visible) {
        this._url = url;
        this._quadtree = undefined;
        this._tilingScheme = new GeographicTilingScheme();
        this._errorEvent = new Event();
        this._levelZeroMaximumError = QuadtreeTileProvider.computeDefaultLevelZeroMaximumGeometricError(this._tilingScheme);

        this._ready = false;

        this.colorizer = new RialtoPointCloudColorizer();
        this.colorizer.rampName = colorizerRampName;
        this.colorizer.dimensionName = colorizerDimensionName;

        this.header = undefined;
        
        this.pointSize = undefined; // in bytes
        
        this.visible = visible;
    };


    Object.defineProperties(RialtoPointCloudProvider.prototype, {
        ready : {
            get : function () {
                "use strict";
                return this._ready;
            }
        },
        quadtree : {
            get : function() {
                return this._quadtree;
            },
            set : function(value) {
                this._quadtree = value;
            }
        },
        tilingScheme : {
            get : function() {
                return this._tilingScheme;
            }
        },
        errorEvent : {
            get : function() {
                return this._errorEvent;
            }
        }
    });


    // Read the point cloud header asynchronously.
    //
    // Sets this.ready when done.
    //
    // Returns a promise.
    RialtoPointCloudProvider.prototype.readHeaderAsync = function () {
        "use strict";

        var deferred = when.defer();

        var that = this;
        var url = this._url;

        loadJson(url).then(function (json) {
            that.header = json;
            
            if (that.header.version != 4) {
                throw new DeveloperError("Rialto Error: unsupported tile version");
            }
            
            that.header.pointSize = that._computePointSize();
            that._ready = true;

            deferred.resolve(that);
        }).otherwise(function () {
            throw new DeveloperError("Rialto Error: failed to load JSON: " + url);
        });

        return deferred.promise;
    };


    // set the dimension and color ramp to be represented as the point cloud
    RialtoPointCloudProvider.prototype.setColorization = function (rampName, dimensionName) {
        "use strict";

        this.colorizer.rampName = rampName;
        this.colorizer.dimensionName = dimensionName;
    };


    var datatype_sizes = {
        "uint8_t": 1,
        "int8_t": 1,
        "uint16_t": 2,
        "int16_t": 2,
        "uint32_t": 4,
        "int32_t": 4,
        "uint64_t": 8,
        "int64_t": 8,
        "float": 4,
        "double": 8
    };


    RialtoPointCloudProvider.prototype._computePointSize = function () {
        "use strict";

        var dims = this.header.dimensions;
        var numBytes = 0;
        var i;

        for (i = 0; i < dims.length; i += 1) {
            dims[i].offset = numBytes;

            if (datatype_sizes[dims[i].datatype] == undefined) {
                throw new DeveloperError("Rialto Error: unknown datatype " + dims[i].datatype);
            }
            
            numBytes += datatype_sizes[dims[i].datatype];
        }

        return numBytes;
    };


    RialtoPointCloudProvider.prototype.beginUpdate = function(context, frameState, commandList) {
    };


    RialtoPointCloudProvider.prototype.endUpdate = function(context, frameState, commandList) {
    };


    RialtoPointCloudProvider.prototype.getLevelMaximumGeometricError = function(level) {
        return this._levelZeroMaximumError / (1 << level);
    };


    // The underlying tile system is such that we will never be asked
    // for a tile unless we have resolved it's parent first.
    //
    // returns:
    //   true - the tile does exist in the DB
    //   false - we are certain that the tile does not exist in the DB
    RialtoPointCloudProvider.prototype.checkExistence = function(tile)
    {
        if (tile.parent == undefined || tile.parent == null) {
            // This is a root tile. The server will always tell us that the root
            // tiles exist in the database. (It may not actually be in the database,
            // but for now the server is designed to return an empty tile if the
            // tile isn't present -- since Cesium will only ask for tiles it knows
            // exist, the server will only ever "lie" about root tiles.)
            return true;
        }

        if (tile.parent.state != QuadtreeTileLoadState.DONE) {
            throw new DeveloperError("Rialto Error: bad load state 1");
        }

        if (tile.parent.data == undefined || tile.parent.data.ppcc == undefined || !tile.parent.data.ppcc.ready) {
            // parent not available for us to ask it about its child,
            // and if the parent doesn't exist yet then the child must not either
            return false;
        }

        var hasChild = tile.parent.data.ppcc.isChildAvailable(tile.parent.x, tile.parent.y, tile.x, tile.y);
        return hasChild;
    }


    RialtoPointCloudProvider.prototype._initTileData = function(tile, frameState) {

        var freeme = function() {
            if (!defined(this.primitive) || this.primitive == null) {
                return;
            }

            this.primitive.destroy();
            this.primitive = undefined;

            if (tile.data != undefined && tile.data != null &&
                tile.data.ppcc != undefined && tile.data.ppcc != null &&
                tile.data.ppcc.dimensions != undefined && tile.data.ppcc.dimensions != null) {
                var header = tile.data.ppcc.header;
                if (header != undefined && header != null) {
                    var headerDims = header.dimensions;
                    for (var i = 0; i < headerDims.length; i += 1) {
                        var name = headerDims[i].name;
                        tile.data.ppcc.dimensions[name] = null;
                    }
                    tile.data.ppcc.dimensions = null;
                }
            }
        };
            
        tile.data = {
            primitive: undefined,
            freeResources: freeme
        };

        tile.data.boundingSphere3D = BoundingSphere.fromRectangle3D(tile.rectangle);
        tile.data.boundingSphere2D = BoundingSphere.fromRectangle2D(tile.rectangle, frameState.mapProjection);
        Cartesian3.fromElements(tile.data.boundingSphere2D.center.z, tile.data.boundingSphere2D.center.x, tile.data.boundingSphere2D.center.y, tile.data.boundingSphere2D.center);
    }


    RialtoPointCloudProvider.prototype.loadTile = function(context, frameState, tile) {

        if (tile.state !== QuadtreeTileLoadState.START && tile.state !== QuadtreeTileLoadState.LOADING) {
            throw new DeveloperError("Rialto Error: bad load state 2");
        }

        if (tile.state === QuadtreeTileLoadState.START) {
            // first, check and see if the tile even exists in the DB
            var exists = this.checkExistence(tile);

            if (exists == false) {
                this._initTileData(tile, frameState);
                tile.renderable = true;
                tile.state = QuadtreeTileLoadState.DONE;
                return;
            }

            this._initTileData(tile, frameState);

            tile.data.ppcc = new RialtoPointCloudTile(this, tile.level, tile.x, tile.y);
            tile.data.ppcc.load(this.visible);

            tile.state = QuadtreeTileLoadState.LOADING;
        }

        if (tile.state === QuadtreeTileLoadState.LOADING && tile.data.ppcc.ready) {

            tile.data.primitive = tile.data.ppcc.primitive;

            if (tile.data.primitive == null) {
                tile.state = QuadtreeTileLoadState.DONE;
                tile.renderable = true;
                return;
            }

            tile.data.primitive.update(context, frameState, []);
            if (tile.data.primitive.ready) {
                tile.state = QuadtreeTileLoadState.DONE;
                tile.renderable = true;
                return;
            }
        }

        // fall-through case: will need to wait for next time around
    };


    RialtoPointCloudProvider.prototype.computeTileVisibility = function(tile, frameState, occluders) {
        var boundingSphere;
        if (frameState.mode === SceneMode.SCENE3D) {
            boundingSphere = tile.data.boundingSphere3D;
        } else {
            boundingSphere = tile.data.boundingSphere2D;
        }
        return frameState.cullingVolume.computeVisibility(boundingSphere);
    };


    RialtoPointCloudProvider.prototype.showTileThisFrame = function(tile, context, frameState, commandList) {

        if (tile.data.primitive != null) {
            tile.data.primitive.update(context, frameState, commandList);
        }
    };


    var subtractScratch = new Cartesian3();

    RialtoPointCloudProvider.prototype.computeDistanceToTile = function(tile, frameState) {
        var boundingSphere;
        if (frameState.mode === SceneMode.SCENE3D) {
            boundingSphere = tile.data.boundingSphere3D;
        } else {
            boundingSphere = tile.data.boundingSphere2D;
        }
        return Math.max(0.0, Cartesian3.magnitude(Cartesian3.subtract(boundingSphere.center, frameState.camera.positionWC, subtractScratch)) - boundingSphere.radius);
    };


    RialtoPointCloudProvider.prototype.isDestroyed = function() {
        return false;
    };


    RialtoPointCloudProvider.prototype.destroy = function() {
        return destroyObject(this);
    };

    return RialtoPointCloudProvider;
});
