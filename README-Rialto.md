Cesium/Rialto
=============

This is the Rialto viewer, a fork of Cesium 1.10 containing support for
rendering tiles of point clouds.

Rialto is a set of open source components built by RadiantBlue Technologies
for working with lidar data. Rialto is tile-based, just like TMS/WMTS but
for point data rather than raster data.

To use the Cesium/Rialto viewer, you need to have a tile server set up,
as described below. Details on the server protocol can be found in the
rialto-geopackage repo: [https://github.com/radiantbluetechnologies/rialto-geopackage/blob/master/README.md].

(The `rialto` branch is the stable one you want. `rialto-develop` is unstable.)


Building
--------

This is just Cesium -- nothing special is needed, just do whatever you
normally do.



Running the Viewer
------------------

There is a demo app at `Apps/Sandcastle/gallery/RialtoPointCloud.html`; it
should appear with all the other sample apps.

You will need a Rialto tile server to use the demo app. It is hard-coded to use a demo data set hosted at `localhost:12346`. Set up the dataset and
run the server as follows:
  * `mkdir /tmp/rialto`
  * Get the Rialto GeoPackage demo tile server: [https://github.com/radiantbluetechnologies/rialto-geopackage/blob/master/server/geopackage_server.py]. Copy it to `/tmp/rialto/geopackage_server.py`
  * Get the sample Rialto GeoPackage file: [https://github.com/radiantbluetechnologies/rialto-data/blob/master/demo/serp-small.gpkg]. Copy it to `/tmp/rialto/serp-small.gpkg`
  * Run the server: `/tmp/rialto/geopackage_server.py localhost 12346 /tmp/rialto`

The `serp-small` dataset should now be available. Test this by browsing:
[http://localhost:12346/serp-small/mytablename]. _(Yes, it really is
called "mytablename".)_ You should get back the datasset's header info in
JSON format.

Run the sample app. Zoom in to lon/lat (-83.4375,39.0123) and you should see
a point cloud. If you don't, ping me.



Summary of Changes to Cesium
============================

We were able to add point cloud support by without touching any of the 
existing Cesium v1.0 files, we only added several new files:
  * Imported the five files from AGI's old point-geometry branch:
    * `Source/Core/PointGeometry.js`
    * `Source/Scene/PointAppearance.js`
    * `Source/Shaders/Appearances/PointAppearanceFS.glsl`
    * `Source/Shaders/Appearances/PointAppearanceVS.glsl`
    * `Source/Workers/createPointGeometry.js`
  * Added four new Rialto source files:
    * `Source/Scene/RialtoGridProvider.js`
    * `Source/Scene/RialtoPointCloudColorizer.js`
    * `Source/Scene/RialtoPointCloudProvider.js`
    * `Source/Scene/RialtoPointCloudTile.js`
  * Added two files for the Rialto sample app:
    * `Apps/Sandcastle/gallery/RialtoPointCloud.html`
    * `Apps/Sandcastle/gallery/RialtoPointCloud.jpg`


    
Getting Help
============

Confused, baffled, or puzzled? Feel free to submit an Issue at
[https://github.com/radiantbluetechnologies/rialto-cesium/issues] or
just email me at mpg@flaxen.com.

-mpg



