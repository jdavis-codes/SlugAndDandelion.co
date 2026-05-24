// Simple cache-buster for local development: appends _cb timestamp to local asset URLs
(function(){
  try {
    var ts = Date.now();
    var isLocal = function(url){
      return url && !url.match(/^([a-z]+:)?\/\//i) && !url.startsWith('data:');
    };

    var addParam = function(url){
      if(!url) return url;
      if(url.indexOf('_cb=') !== -1) return url;
      return url + (url.indexOf('?') === -1 ? '?' : '&') + '_cb=' + ts;
    };

    // Stylesheets
    var links = document.getElementsByTagName('link');
    for(var i=0;i<links.length;i++){
      var l = links[i];
      if(l.rel === 'stylesheet' && isLocal(l.href)) l.href = addParam(l.href);
    }

    // Scripts (modify before they load where possible)
    var scripts = document.getElementsByTagName('script');
    for(var j=0;j<scripts.length;j++){
      var s = scripts[j];
      if(s.src && isLocal(s.src)) s.src = addParam(s.src);
    }

    // Images
    var imgs = document.getElementsByTagName('img');
    for(var k=0;k<imgs.length;k++){
      var im = imgs[k];
      if(im.src && isLocal(im.src)) im.src = addParam(im.src);
      // also handle data-alt attributes used for employees
      if(im.dataset && im.dataset.alt && isLocal(im.dataset.alt)) im.dataset.alt = addParam(im.dataset.alt);
    }
  } catch(e) {
    // fail silently in prod
    console && console.error && console.error('cachebust error', e);
  }
})();
