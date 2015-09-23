/*global define*/
define([
        '../Core/Cartesian3',
        '../Core/Color',
        '../Core/destroyObject',
        '../Core/defined',
        '../Core/DeveloperError',
        '../Core/GeometryInstance',
        '../Core/loadArrayBuffer',
        '../Core/PointGeometry',
        './Cesium3DTileContentState',
        './getMagic',
        './PointAppearance',
        './Primitive',
        '../ThirdParty/when'
    ], function(
        Cartesian3,
        Color,
        destroyObject,
        defined,
        DeveloperError,
        GeometryInstance,
        loadArrayBuffer,
        PointGeometry,
        Cesium3DTileContentState,
        getMagic,
        PointAppearance,
        Primitive,
        when) {
    "use strict";

    /**
     * @private
     */
    var Points3DTileContentProvider = function(tileset, url, contentHeader) {

        console.log("Points3DTileContentProvider - " + url);

        this._primitive = undefined;
        this._url = url;

        /**
         * @readonly
         */
        this.state = Cesium3DTileContentState.UNLOADED;

        /**
         * @type {Promise}
         */
        this.processingPromise = when.defer();

        /**
         * @type {Promise}
         */
        this.readyPromise = when.defer();

        if (contentHeader.box) {
            console.log("Points3DTileContentProvider - box: " + contentHeader.box);
            var box = contentHeader.box;
            var rect = new Cesium.Rectangle(box[0], box[1], box[2], box[3]);
            console.log("Points3DTileContentProvider - rect: " + rect.west + " " + rect.south + " " + rect.east + " " + rect.north);
            this.boundingSphere = Cesium.BoundingSphere.fromRectangle2D(rect);
            console.log("Points3DTileContentProvider - sphere: " + this.boundingSphere.center + " " + this.boundingSphere.radius);            
        } else {
            this.boundingSphere = contentHeader.boundingSphere;
        }
            
        this._debugColor = Color.fromRandom({ alpha : 1.0 });
        this._debugColorizeTiles = false;
    };

    var sizeOfUint32 = Uint32Array.BYTES_PER_ELEMENT;

    Points3DTileContentProvider.prototype.request = function() {

        console.log("Points3DTileContentProvider.request - " + this._url);
        var that = this;

        this.state = Cesium3DTileContentState.LOADING;

        function failRequest(error) {
            that.state = Cesium3DTileContentState.FAILED;
            that.readyPromise.reject(error);
        }

        loadArrayBuffer(this._url).then(function(arrayBuffer) {
            var magic = getMagic(arrayBuffer);
            if (magic !== 'pnts') {
                throw new DeveloperError('Invalid Points tile.  Expected magic=pnts.  Read magic=' + magic);
            }

            var view = new DataView(arrayBuffer);
            var byteOffset = 0;

            byteOffset += sizeOfUint32;  // Skip magic number

            //>>includeStart('debug', pragmas.debug);
            var version = view.getUint32(byteOffset, true);
            if (version !== 1) {
                throw new DeveloperError('Only Points tile version 1 is supported.  Version ' + version + ' is not.');
            }
            //>>includeEnd('debug');
            byteOffset += sizeOfUint32;

            var numberOfPoints = view.getUint32(byteOffset, true);
            byteOffset += sizeOfUint32;

            console.log("Points3DTileContentProvider.loadArrayBuffer - numPoints=" + numberOfPoints);

            var positionsOffsetInBytes = byteOffset;
            var positions = new Float32Array(arrayBuffer, positionsOffsetInBytes, numberOfPoints * 3);

            console.log("positions (lonlath): " + positions[0] + " " + positions[1] + " " + positions[2]);
            console.log("positions (lonlath): " + positions[(numberOfPoints-1)*3] + " " + positions[(numberOfPoints-1)*3+1] + " " + positions[(numberOfPoints-1)*3+2]);
            
            for (var i =0 ; i < numberOfPoints * 3; i+=3) {
                var cartesian = Cesium.Cartesian3.fromDegrees(positions[i], positions[i+1], positions[i+2]);
                positions[i] = cartesian.x;
                positions[i+1] = cartesian.y;
                positions[i+2] = cartesian.z;
            }
            console.log("positions (xyz): " + positions[0] + " " + positions[1] + " " + positions[2]);
            console.log("positions (xyz): " + positions[(numberOfPoints-1)*3] + " " + positions[(numberOfPoints-1)*3+1] + " " + positions[(numberOfPoints-1)*3+2]);

            var colorsOffsetInBytes = positionsOffsetInBytes + (numberOfPoints * (3 * Float32Array.BYTES_PER_ELEMENT));
            var colors = new Uint8Array(arrayBuffer, colorsOffsetInBytes, numberOfPoints * 3);

            console.log("sphere: " + that.boundingSphere.center.x + " " + that.boundingSphere.center.y + " " + that.boundingSphere.center.z + " " + that.boundingSphere.radius);

            // TODO: use custom load pipeline, e.g., RTC, scene3DOnly?
            // TODO: performance test with 'interleave : true'
            var instance = new GeometryInstance({
                geometry : new PointGeometry({
                    positionsTypedArray : positions,
                    colorsTypedArray: colors,
                    boundingSphere: that.boundingSphere
                })
            });
            var primitive = new Primitive({
                geometryInstances : instance,
                appearance : new PointAppearance(),
                asynchronous : false,
                allowPicking : false,
                cull : false,
                rtcCenter : that.boundingSphere.center
            });

            that._primitive = primitive;
            that.state = Cesium3DTileContentState.PROCESSING;
            that.processingPromise.resolve(that);

            when(primitive.readyPromise).then(function(primitive) {
                that.state = Cesium3DTileContentState.READY;
                that.readyPromise.resolve(that);
            }).otherwise(failRequest);
        }).otherwise(failRequest);
    };

    function applyDebugSettings(owner, content) {
        if (owner.debugColorizeTiles && !content._debugColorizeTiles) {
            content._debugColorizeTiles = true;
            content._primitive.appearance.uniforms.highlightColor = content._debugColor;
        } else if (!owner.debugColorizeTiles && content._debugColorizeTiles) {
            content._debugColorizeTiles = false;
            content._primitive.appearance.uniforms.highlightColor = Color.WHITE;
        }
        content._debugColorizeTiles = true;
        content._primitive.appearance.uniforms.highlightColor = Color.WHITE;
    }

    Points3DTileContentProvider.prototype.update = function(owner, context, frameState, commandList) {
        // In the PROCESSING state we may be calling update() to move forward
        // the content's resource loading.  In the READY state, it will
        // actually generate commands.

        applyDebugSettings(owner, this);

        this._primitive.update(context, frameState, commandList);
    };

    Points3DTileContentProvider.prototype.isDestroyed = function() {
        return false;
    };

    Points3DTileContentProvider.prototype.destroy = function() {
        this._primitive = this._primitive && this._primitive.destroy();

        return destroyObject(this);
    };

    return Points3DTileContentProvider;
});
