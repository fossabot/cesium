// This is a copy of the DemoTileProvider from the Cesium sources,
// just because it served as a good template and debugging aid for the
// point cloud tile provider.

define([
        '../Cesium',
        '../Core/defined',
        '../Core/destroyObject',
        '../Core/BoundingSphere',
        '../Core/Cartesian3',
        '../Core/ColorGeometryInstanceAttribute',
        '../Core/GeometryInstance',
        '../Core/Color',
        '../Core/Event',
        '../Core/GeographicTilingScheme',
        '../Core/RectangleOutlineGeometry',
        '../Scene/QuadtreeTileLoadState',
        '../Scene/QuadtreeTileProvider',
        '../Scene/PerInstanceColorAppearance',
        '../Scene/Primitive',
        '../Scene/SceneMode'
    ], function(
        Cesium,
        defined,
        destroyObject,
        BoundingSphere,
        Cartesian3,
        ColorGeometryInstanceAttribute,
        GeometryInstance,
        Color,
        Event,
        GeographicTilingScheme,
        RectangleOutlineGeometry,
        QuadtreeTileLoadState,
        QuadtreeTileProvider,
        PerInstanceColorAppearance,
        Primitive,
        SceneMode
    ) {
    "use strict";

    
    var RialtoGridProvider = function() {
        this._quadtree = undefined;
        this._tilingScheme = new GeographicTilingScheme();
        this._errorEvent = new Event();
        this._levelZeroMaximumError = QuadtreeTileProvider.computeDefaultLevelZeroMaximumGeometricError(this._tilingScheme);
    };

    Object.defineProperties(RialtoGridProvider.prototype, {
        quadtree : {
            get : function() {
                return this._quadtree;
            },
            set : function(value) {
                this._quadtree = value;
            }
        },

        ready : {
            get : function() {
                return true;
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

    RialtoGridProvider.prototype.beginUpdate = function(context, frameState, commandList) {
    };

    RialtoGridProvider.prototype.endUpdate = function(context, frameState, commandList) {
    };

    RialtoGridProvider.prototype.getLevelMaximumGeometricError = function(level) {
        return this._levelZeroMaximumError / (1 << level);
    };

    RialtoGridProvider.prototype.loadTile = function(context, frameState, tile) {
        if (tile.state === QuadtreeTileLoadState.START) {
            tile.data = {
                primitive : undefined,
                freeResources : function() {
                    if (defined(this.primitive)) {
                        this.primitive.destroy();
                        this.primitive = undefined;
                    }
                }
            };
            var color = Color.fromBytes(192, 192, 192, 255);

            tile.data.primitive = new Primitive({
                geometryInstances : new GeometryInstance({
                    geometry : new RectangleOutlineGeometry({
                        rectangle : tile.rectangle
                    }),
                    attributes : {
                        color : ColorGeometryInstanceAttribute.fromColor(color)
                    }
                }),
                appearance : new PerInstanceColorAppearance({
                    flat : true
                })
            });

            tile.data.boundingSphere3D = BoundingSphere.fromRectangle3D(tile.rectangle);
            tile.data.boundingSphere2D = BoundingSphere.fromRectangle2D(tile.rectangle, frameState.mapProjection);
            Cartesian3.fromElements(tile.data.boundingSphere2D.center.z, tile.data.boundingSphere2D.center.x, tile.data.boundingSphere2D.center.y, tile.data.boundingSphere2D.center);

            tile.state = QuadtreeTileLoadState.LOADING;
        }

        if (tile.state === QuadtreeTileLoadState.LOADING) {
            tile.data.primitive.update(context, frameState, []);
            if (tile.data.primitive.ready) {
                tile.state = QuadtreeTileLoadState.DONE;
                tile.renderable = true;
            }
        }
    };

    RialtoGridProvider.prototype.computeTileVisibility = function(tile, frameState, occluders) {
        var boundingSphere;
        if (frameState.mode === SceneMode.SCENE3D) {
            boundingSphere = tile.data.boundingSphere3D;
        } else {
            boundingSphere = tile.data.boundingSphere2D;
        }

        return frameState.cullingVolume.computeVisibility(boundingSphere);
    };

    RialtoGridProvider.prototype.showTileThisFrame = function(tile, context, frameState, commandList) {
        tile.data.primitive.update(context, frameState, commandList);
    };

    var subtractScratch = new Cartesian3();

    RialtoGridProvider.prototype.computeDistanceToTile = function(tile, frameState) {
        var boundingSphere;

        if (frameState.mode === SceneMode.SCENE3D) {
            boundingSphere = tile.data.boundingSphere3D;
        } else {
            boundingSphere = tile.data.boundingSphere2D;
        }

        return Math.max(0.0, Cartesian3.magnitude(Cartesian3.subtract(boundingSphere.center, frameState.camera.positionWC, subtractScratch)) - boundingSphere.radius);
    };

    RialtoGridProvider.prototype.isDestroyed = function() {
        return false;
    };

    RialtoGridProvider.prototype.destroy = function() {
        return destroyObject(this);
    };

return RialtoGridProvider;
});
