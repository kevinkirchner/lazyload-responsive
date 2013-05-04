/*!
* contentloaded.js
*
* Author: Diego Perini (diego.perini at gmail.com)
* Summary: cross-browser wrapper for DOMContentLoaded
* Updated: 20101020
* License: MIT
* Version: 1.2
*
* URL:
* http://javascript.nwbox.com/ContentLoaded/
* http://javascript.nwbox.com/ContentLoaded/MIT-LICENSE
*
*/

// @win window reference
// @fn function reference
function contentLoaded(win, fn) {

    var done = false, top = true,

    doc = win.document, root = doc.documentElement,

    add = doc.addEventListener ? 'addEventListener' : 'attachEvent',
    rem = doc.addEventListener ? 'removeEventListener' : 'detachEvent',
    pre = doc.addEventListener ? '' : 'on',

    init = function(e) {
        if (e.type == 'readystatechange' && doc.readyState != 'complete') return;
        (e.type == 'load' ? win : doc)[rem](pre + e.type, init, false);
        if (!done && (done = true)) fn.call(win, e.type || e);
    },

    poll = function() {
        try { root.doScroll('left'); } catch(e) { setTimeout(poll, 50); return; }
        init('poll');
    };

    if (doc.readyState == 'complete') fn.call(win, 'lazy');
    else {
        if (doc.createEventObject && root.doScroll) {
            try { top = !win.frameElement; } catch(e) { }
            if (top) poll();
        }
        doc[add](pre + 'DOMContentLoaded', init, false);
        doc[add](pre + 'readystatechange', init, false);
        win[add](pre + 'load', init, false);
    }

}



/*!
* lazyload-responsive.js
*
* Author: Kevin Kirchner (kirchner.kevin at gmail.com)
* Summary: cross-browser lazy and responsive image loader
* Version: 0.2.1
*
* URL:
* https://github.com/kevinkirchner/lazyload-responsive
*
*/

// TODO:
// use some sort of promise-type OnReadyStateChange with the urlExists method so images aren't being requested while others are being loaded
    // have baseSrc saved in a queue while image is loading
// Optimize when everything gets initilized and isolate the things that need dom loaded

(function(window, document){
    
    // Set default configuration
    var config = {
        srcAttr: 'data-lzld-src',
        offset: 200, // distance (px) below the fold where images will be loaded
        highResThreshold: 1.5, // any pixel ratio >= this number will be flagged as high-res
        throttleInterval: 20, // throttled interval for scroll and resize events
        useGlobalImgConfig: false, // if `false`, the script will look for the following imgConfig on each lzld img (e.g. img.getAttribute('data-lzld-highressuffix') || imgConfig.highressuffix - which takes the script longer to process); setting to `true` is the fastest option
        imgConfig: {
            highressuffix: '@2x', // e.g. imagename@2x.jpg or imagename_400@2x.jpg would be the high-res images
            loadevent: ['scroll','resize'], // you may want to load the images on a custom event; this is where you do that
            longfallback: true, // will look for all smaller images before loading the original (and largest image)
            lowres: false, // forces script to **not** look for high-res images
            sizedown: false, // by default images are sized up; this option forces it to get an image larger than the viewport and shrink it; NOTE: setting to `true` will load larger images and increase pageload
            smaller: false, // forces script to look for and load smaller images as viewport is resized to a smaller size
            widthfactor: 200 // looks for images with the following naming convention [real-image-src]_[factor of widthfactor].[file-extenstion]
        }
    };
    
    var domReady = false;
    contentLoaded(window,function(){ domReady = true; });
    
    var LazyloadResponsive = {
        // Options
        _o: config,
        // Flags
        _f: {},
        // Init variables
        imgs: [],
        loadImgsQ: [], // All images start here
        loadedImgs: [], // All loaded (and correctly sized) images end here; Also doubles as the array of images that need to be checked when browser is resized
        requestingBaseImgSrc: [], // Store base file name (e.g. 'path/to/image.jpg') of image srcs currently being requested to prevent multiple requests for different sizes of the same image
        requestImgsQ: [], // Full src queue of different sizes of an image currently being requested in case it 404s
        availableImgSrc: [], // Store all successful requests to reuse when needed
        unavailableImgSrc: [], // Store all unsuccessful requests to prevent an unnecessary 404 request
        initilize: function() {
            var that = this;
            // Set high-res flag
            that._f.isHighRes = that._u.getPixelRatio() >= that._o.highResThreshold;
            // Collect images
            that.collectImgs();
            // Load first batch of images
            that.loadImgs();
            // Attach Events
            that.attachEvents();
        },
        // This can be run after adding new images to the page to make them lazyload-responsive
        collectImgs: function() {
            var that = this;
            var allImgs = document.getElementsByTagName( "img" );
            for ( var i = 0, il = allImgs.length; i < il; i++ ){
                if ( allImgs[i].getAttribute( that._o.srcAttr ) !== null ) {
                    var img = allImgs[i];
                    if (that._u.inArray(img, that.imgs) === -1) {
                        that.imgs.push( img );
                    };
                    if (!img.getAttribute('data-lzld-complete') && that._u.isVisible(img)) {
                        that.loadImgsQ.push( img )
                    };
                }
            }
        },
        loadImgs: function() {
            // start with loadImgsQ
            var that = this;
            for (var i = that.loadImgsQ.length - 1; i >= 0; i--) {
                var img = that.loadImgsQ[i];
                var imgData = that.getImgData(img);
                // begin the request(s)
                that.requestImg(imgData);
                // remove from loadImgsQ
                that.loadImgsQ.splice(i,1);
            }
        },
        // Should only be run once per image, otherwise it needs to be stored. imgData.aliasArray is the only one that should need to change
        getImgData: function(img) {
            var that = this;
            var imgConfig = that.getImgConfig(img);
            var parseImgSrc = img.getAttribute('data-lzld-isparsed') ? that.getStoredParsedImgSrc(img) : that.getParsedImgSrc(img);
            var aliasArray = that.getAliasArray(img, imgConfig);
            var imgData = {
                // store the element
                _e: { img: img },
                // image config options
                _o: imgConfig,
                // get parsed img src
                _p: parseImgSrc,
                // calculate array of names to try with the current browser width and image options taken into account
                aliasArray: aliasArray
            };
            return imgData;
        },
        getImgConfig: function(img) {
            var that = this;
            if (that._o.useGlobalImgConfig) return that._o.imgConfig;
            // else look for options stored on the <img>
            return {
                highressuffix:  img.getAttribute('data-lzld-highressuffix') || that._o.imgConfig.highressuffix,
                loadevent:      img.getAttribute('data-lzld-loadevent') || that._o.imgConfig.loadevent,
                longfallback:   img.getAttribute('data-lzld-longfallback') || that._o.imgConfig.longfallback,
                lowres:         img.getAttribute('data-lzld-lowres') || that._o.imgConfig.lowres,
                sizedown:       img.getAttribute('data-lzld-sizedown') || that._o.imgConfig.sizedown,
                smaller:        img.getAttribute('data-lzld-smaller') || that._o.imgConfig.smaller,
                widthfactor:    img.getAttribute('data-lzld-widthfactor') || that._o.imgConfig.widthfactor
            };
        },
        getStoredParsedImgSrc: function(img) {
            return {
                filePath: img.getAttribute('data-lzld-filepath'),
                fileName: img.getAttribute('data-lzld-filename'),
                fileExt: img.getAttribute('data-lzld-fileext')
                aliasBase: img.getAttribute('data-lzld-aliasbase')
                baseSrc: img.getAttribute('data-lzld-basesrc')
            };
        },
        getParsedImgSrc: function(img) {
            var that = this,
                imgSrc = img.getAttribute( that._o.srcAttr ),
                lastSlash = imgSrc.lastIndexOf('/')+1,
                filePath = imgSrc.substring(0,lastSlash),
                file = imgSrc.substring(lastSlash),
                lastPeriod = file.lastIndexOf('.'),
                fileName = file.substring(0,lastPeriod),
                fileExt = file.substring(lastPeriod);
            // Store on the image for later use if needed
            img.setAttribute('data-lzld-filepath', filePath);
            img.setAttribute('data-lzld-filename', fileName);
            img.setAttribute('data-lzld-fileext', fileExt);
            img.setAttribute('data-lzld-aliasbase', filePath + fileName);
            img.setAttribute('data-lzld-basesrc', filePath + fileName + fileExt);
            // Mark img as 'isparsed'
            img.setAttribute('data-lzld-isparsed','true');
            // Return parsed parts
            return {
                filePath: filePath,
                fileName: fileName,
                fileExt: fileExt,
                aliasBase: filePath + fileName,
                baseSrc: filePath + fileName + fileExt
            };
        },
        getAliasArray: function(img, imgConfig) {
            var aliasArray = [];
            var useHighRes = that._f.isHighRes && !imgConfig.lowres;
            var viewportWidth = that._u.getViewport("Width");
            var viewportWidthFactor = Math.floor( viewportWidth / imgConfig.widthfactor );
            var firstAlias = !imgConfig.sizedown ? viewportWidthFactor * imgConfig.widthfactor : (viewportWidthFactor+1) * imgConfig.widthfactor;
            // look for at least one resized image
            if (useHighRes) aliasArray.push( '_' + firstAlias + imgConfig.highressuffix );;
            aliasArray.push( '_' + firstAlias );
            // if longfallback then add to many more to the array
            if (imgConfig.longfallback) {
                for (var i = viewportWidthFactor-1; i >= 0; i--){
                    var alias = !imgConfig.sizedown ? i * imgConfig.widthfactor : (i+1) * imgConfig.widthfactor;
                    if (useHighRes) aliasArray.push( '_' + alias + imgConfig.highressuffix );
                    aliasArray.push( '_' + alias );
                };
            };
            // a fallback to look for the smallest image
            if (useHighRes) aliasArray.push( '_small' + imgConfig.highressuffix );
            aliasArray.push( '_small' );
            // final fallback to the original image
            if (useHighRes) aliasArray.push( imgConfig.highressuffix );
            aliasArray.push( '' );
            
            return aliasArray;
        },
        requestImg: function(imgData) {
            var that = this;
            // if not in requestingBaseImgSrc
            if (imgData.aliasArray.length && that._u.inArray(imgData._p.baseSrc, that.requestingBaseImgSrc) === -1) {
                that.requestingBaseImgSrc.push(imgData._p.baseSrc);
                // make the next request in the alias array
                // TODO
                // remove first alias (the one we just used) from aliasArray
                imgData.aliasArray.splice(0,1);
                // when it's finished checking it will remove the baseSrc from requestingBaseImgSrc, and make the next request if needed
            } else {
                console.log("requestImg:",imgData);
            }
        }
    }
    
    // Utility methods - methods that are ok all by themselves and don't need any extra outside info
    LazyloadResponsive._u = {
        lzld: LazyloadResponsive,
        _o: config,
        throttle: function(fn, minDelay) {
            var lastCall = 0;
            return function() {
                var now = +new Date();
                if (now - lastCall < minDelay) {
                    return;
                }
                lastCall = now;
                // we do not return anything as
                // https://github.com/documentcloud/underscore/issues/387
                fn.apply(this, arguments);
            };
        },
        urlExists: function(url) {
            var req = new XMLHttpRequest();
            req.open('GET', url, false);
            req.send();
            return req.status==200;
        },
        addEvent: function(el, type, fn) {
          if (el.attachEvent) {
            el.attachEvent && el.attachEvent( 'on' + type, fn );
          } else {
            el.addEventListener( type, fn, false );
          }
        },
        removeEvent: function(el, type, fn) {
          if (el.detachEvent) {
            el.detachEvent && el.detachEvent( 'on' + type, fn );
          } else {
            el.removeEventListener( type, fn, false );
          }
        },
        // https://github.com/jquery/jquery/blob/f3515b735e4ee00bb686922b2e1565934da845f8/src/core.js#L610
        // We cannot use Array.prototype.indexOf because it's not always available
        inArray: function(elem, array, i) {
            var len;
            if ( array ) {
                if ( Array.prototype.indexOf ) {
                    return Array.prototype.indexOf.call( array, elem, i );
                }
                len = array.length;
                i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;
                for ( ; i < len; i++ ) {
                    // Skip accessing in sparse arrays
                    if ( i in array && array[ i ] === elem ) {
                        return i;
                    }
                }
            }
            return -1;
        },
        isVisible: function(img) {
            var that = this;
            var winH = that.getViewport("Height");
            return (that.contains(document.documentElement, img) && img.getBoundingClientRect().top < winH + that._o.offset);
        },
        getViewport: function(dimension) {
            if (document.documentElement["client"+dimension] >= 0) {
              return document.documentElement["client"+dimension];
            } else if (document.body && document.body["client"+dimension] >= 0) {
              return document.body["client"+dimension];
            } else if (window["inner"+dimension] >= 0) {
              return window["inner"+dimension];
            } else {
              return 0;
            }
        },
        // https://github.com/jquery/sizzle/blob/3136f48b90e3edc84cbaaa6f6f7734ef03775a07/sizzle.js#L708
        contains: function(a,b) {
            if (document.documentElement.compareDocumentPosition) {
                return !!(a.compareDocumentPosition( b ) & 16);
            };
            if (document.documentElement.contains) {
                return a !== b && ( a.contains ? a.contains( b ) : false );
            };
            while ( (b = b.parentNode) ) {
              if ( b === a ) {
                return true;
              }
            }
            return false;
        },
        getPixelRatio: function() {
            return !!window.devicePixelRatio ? window.devicePixelRatio : 1;
        }
    }
    
    // Bind to window
    window.LazyloadResponsive = LazyloadResponsive;
    // Engage!
    if (domReady) {
        window.LazyloadResponsive.initialize();
    } else {
        contentLoaded(window, function(){
            window.LazyloadResponsive.initialize();
        });
    }
    
})(this,document);