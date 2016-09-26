/** Загрузчик модулей ГеоМиксера
Позволяет загружать модули из разных файлов.
Модуль - единица кода, имеющая уникальное имя и зависящая от других модулей и скриптов.
@namespace
*/

var gmxCore = function()
{
    var _callbacks = [];
    var _modules = {}; //null - файл модуля уже загружается, но сам модуль пока не доступен
    var _globalNamespace = this;
	var _modulesDefaultHost = "";
	var _modulePathes = {/*#buildinclude<modules_path.txt>*/};
	var _moduleFiles = {/*#buildinclude<module_files.txt>*/};

    var getScriptURL = function(scriptName)
	{
        scriptName = scriptName.toLowerCase();
		var scripts1 = document.getElementsByTagName("script");
		for (var i = 0; i < scripts1.length; i++)
		{
			var src = scripts1[i].getAttribute("src");
			if (src && (src.toLowerCase().indexOf(scriptName) != -1))
				return src;
		}
		return false;
	}

    //производится регистронезависимое сравнение
	var getScriptBase = function(scriptName)
	{
        scriptName = scriptName.toLowerCase();
		var url = getScriptURL(scriptName);
		return url ? url.toLowerCase().substring(0, url.toLowerCase().indexOf(scriptName)) : "";
	}

    var invokeCallbacks = function()
    {
        for (var k = 0; k < _callbacks.length; k++)
        {
            var isAllModules = true;
            var curModules = _callbacks[k].modules;
			var modules = [];
            for (var m = 0; m < curModules.length; m++)
			{
                if ( !_modules[curModules[m]] )
                {
                    isAllModules = false;
                    break;
                }
				modules.push(_modules[curModules[m]]);
			}

            if (isAllModules)
            {
                var curCallback = _callbacks[k].callback;

                //first delete, then callback!
                _callbacks.splice(k, 1);
                k = k - 1;
                curCallback.apply(null, modules);
            }
        }
    }
    var LABjsDeferred = null;
    var lazyLoadLABjs = function()
    {
        if (!LABjsDeferred) {
            LABjsDeferred = $.Deferred();

            //load LAB.js (snippest from its website)
            (function(g,b,d){var c=b.head||b.getElementsByTagName("head"),D="readyState",E="onreadystatechange",F="DOMContentLoaded",G="addEventListener",H=setTimeout;
            H(function(){if("item"in c){if(!c[0]){H(arguments.callee,25);return}c=c[0]}var a=b.createElement("script"),e=false;a.onload=a[E]=function(){if((a[D]&&a[D]!=="complete"&&a[D]!=="loaded")||e){return false}a.onload=a[E]=null;e=true;LABjsDeferred.resolve()};

            a.src = ( getScriptBase('gmxcore.js') || window.gmxJSHost || "" ) + 'LAB.min.js';

            c.insertBefore(a,c.firstChild)},0);if(b[D]==null&&b[G]){b[D]="loading";b[G](F,d=function(){b.removeEventListener(F,d,false);b[D]="complete"},false)}})(this,document);

        }

        return LABjsDeferred.promise();
    }

    var cssLoader = null;

    var withCachePostfix = function(filename) {
        var sym = filename.indexOf('?') === -1 ? '?' : '&';
        if (window.gmxDropBrowserCache) {
            filename += sym + Math.random();
        } else if (window.nsGmx && nsGmx.buildGUID){
            filename += sym + nsGmx.buildGUID;
        }

        return filename;
    }

    var publicInterface =
    /** @lends gmxCore */
    {
        /** Добавить новый модуль
        * @param {String} moduleName Уникальное имя модуля
        * @param {Object|Function} moduleObj Тело модуля или ф-ция, возвращающая тело. Аргумент ф-ции - путь к модулю. Будет вызвана после загрузки всех зависимостей.
        * @param {Object} [options] Дополнительные параметры модуля
        * @param {String[]} [options.require] Какие модули должны быть загрежены перед данным
        * @param {Function} [options.init] Ф-ция для инициализации модуля. Сигнатура: function (moduleObj, modulePath)->{void|{@link jQuery.Deferred}}. Если ф-ция возвращает {@link jQuery.Deferred}, загрузчик будет ждать его для окончания инициализации.
        * @param {String|String[]} [options.css] CSS файлы для загрузки. Пути к CSS указываются относительно файла текущего модуля.
        */
        addModule: function(moduleName, moduleObj, options)
        {
            var requiredModules = (options && 'require' in options) ? options.require : [];
            var initDeferred = null;
            var _this = this;

            for (var r = 0; r < requiredModules.length; r++)
                this.loadModule( requiredModules[r] );

            this.addModulesCallback( requiredModules, function()
            {

                if (options && 'init' in options)
				{
                    initDeferred = options.init(moduleObj, _modulePathes[moduleName]);
				}

                if (options && 'css' in options)
				{
                    var cssFiles = typeof options.css === 'string' ? [options.css] : options.css;
                    var path = _modulePathes[moduleName] || window.gmxJSHost || "";

                    for (var iF = 0; iF < cssFiles.length; iF++)
                        _this.loadCSS(withCachePostfix(path + cssFiles[iF]));
				}

                var doAdd = function() {
                    if (typeof moduleObj === 'function') {
                        moduleObj = moduleObj( _modulePathes[moduleName] );
                    }
                    _modules[moduleName] = moduleObj;
                    invokeCallbacks();
                }

                if (initDeferred) {
                    initDeferred.done(doAdd);
                } else {
                    doAdd();
                }
            });
        },

        /** Загрузить модуль
        * @param { String } moduleName Имя модуля для загрузки
        * @param { String } [moduleSource] Имя файла, откуда загружать модуль. Если не указан, будет сформирован в виде (defaultHost + moduleName + '.js')
        * @param { Function } [callback] Ф-ция, которая будет вызвана после загрузки и инициализации. В ф-цию первым параметром передаётся тело модуля
        * @return { jQuery.Deferred } Promise, который будет resolve при загрузке модуля (параметр - модуль).
        */
        loadModule: function(moduleName, moduleSource, callback)
        {
            var def = $.Deferred();

            if (typeof moduleSource === 'function') {
                callback = moduleSource;
                moduleSource = undefined;
            }

            this.addModulesCallback([moduleName], function(module)
            {
                callback && callback(module);
                def.resolve(module);
            });

            if ( ! (moduleName in _modules) )
            {
                _modules[moduleName] = null;

                var headElem = document.getElementsByTagName("head")[0];
                var newScript = document.createElement('script');

                var path;
                if (typeof moduleSource != 'undefined')
                {
                    path = moduleSource.match(/^http:\/\//i) ? moduleSource : (window.gmxJSHost || "") + moduleSource;
                }
                else
                {
                    path = (moduleName in _moduleFiles) ? _moduleFiles[moduleName] : (_modulesDefaultHost || window.gmxJSHost || "") + moduleName + '.js';
                }

                var pathRegexp = /(.*)\/[^\/]+/;
                if ( typeof _modulePathes[moduleName] === 'undefined' )
                    _modulePathes[moduleName] = pathRegexp.test(path) ? path.match(pathRegexp)[1] + "/" : "";

                var pathPostfix = "";

                newScript.onerror = function() {
                    def.reject();
                }

                newScript.type = 'text/javascript';
                newScript.src = withCachePostfix(path);
                newScript.charset = "utf-8";
                headElem.appendChild(newScript);
            }

            return def;
        },

        /** Добавить callback, который будет вызван после загрузки моделей
        *
        * Если модули уже загружены, callback будет вызван сразу же
        *
        * @param {Array} moduleNames Массив имён модулей
        * @param {Function} callback Ф-ция, которую нужно вызвать после загрузки. В качестве аргументов в ф-цию передаются загруженные модули
        */
        addModulesCallback: function( moduleNames, callback )
        {
            _callbacks.push({modules: moduleNames, callback: callback});
            invokeCallbacks();
        },

        /** Получить модуль по имени.
        *
        * @param {String} moduleName Имя модуля
        * @return {Object} Тело модуля. Если модуль не загружен, вернётся null.
        */
        getModule: function(moduleName)
        {
            return _modules[moduleName] || null;
        },

        /** Установить дефольный путь к модулям. Используется если указан локальный файл модуля.
        * @param {String} defaultHost Дефолтный путь у модулям.
        */
		setDefaultModulesHost: function( defaultHost )
		{
			_modulesDefaultHost = defaultHost;
		},

        /** Явно задать полный путь к модулю
        * @param {String} moduleName Имя модуля
        * @param {String} defaultHost Путь к файлу модулю. При загрузке модуля будет загружен файл по указанному пути
        */
        setModuleFile: function(moduleName, moduleFile)
        {
            _moduleFiles[moduleName] = moduleFile;
        },

        pushModule2GlobalNamespace: function(moduleName)
        {
            if ( !_modules[moduleName] ) return;
            var module = _modules[moduleName];

            for (var p in module)
                _globalNamespace[p] = module[p];
        },

        /** Получить путь к директории, из которой был загружен модуль.
        * @param {String} moduleName Имя модуля
        * @returns {String} Путь к директории, из которой был загружен модуль. Для не загруженных модулей ничего не возвращает
        */
		getModulePath: function(moduleName)
		{
			return _modulePathes[moduleName];
		},

        /** Возвращает ф-цию, которая делает следующее:
        *
        *  - Если модуль moduleName не загружен, загружает его
        *  - Потом просто вызывает ф-цию с именем functionName из этого модуля, передав ей все свои параметры
        *
        *  - Возвращённая ф-ция при вызове возвращает jQuery.Promise, который будет resolve с параметрами, возвращёнными исходной ф-цией из модуля
        * @param {String} moduleName Имя модуля
        * @param {String} functionName Название ф-ции внутри модуля
        * @param {Function} callback Ф-ция, которая будет вызвана после того, как отработает ф-ция модуля. В callback будет передан ответ исходной ф-ции.
        */
        createDeferredFunction: function(moduleName, functionName, callback)
        {
            var _this = this;
            return function()
            {
                var deferred = $.Deferred();
                var args = arguments;
                _this.loadModule(moduleName).done(function(module)
                {
                    var res = module[functionName].apply(this, args);
                    callback && callback(res);
                    deferred.resolve(res);
                });

                return deferred.promise();
            }
        },

        /** Загружает скрипт после предвариетельной проверки условий.
        *
        * @param {Array} filesInfo Массив объектов со следующими свойствами:
        *
        *   * check: function() -> Bool. Если возвращает true, ни js ни css не будет загружены
        *   * script: String. Не обязательно. Скрипт для загрузки, если провалится проверка
        *   * css: String | String[]. Не обязательно. CSS файл(ы) для загрузки, если провалится проверка
        *   @returns {jQuery.Deferred} Deferred, который будет разрешён когда все скрипты выполнятся (окончание загрузки css не отслеживается)
        */
        loadScriptWithCheck: function(filesInfo)
        {
            var _this = this;
            var localFilesInfo = filesInfo.slice(0);
            var def = $.Deferred();

            var doLoad = function(info)
            {
                if (localFilesInfo.length > 0)
                {
                    var curInfo = localFilesInfo.shift();
                    if (curInfo.check())
                        doLoad()
                    else
                    {
                        var css = curInfo.css || [];
                        if (typeof css === 'string') {
                            css = [css];
                        }
                        css.forEach(_this.loadCSS);

                        if (curInfo.script)
                            _this.loadScript(curInfo.script).then(doLoad);
                        else
                            doLoad();
                    }
                }
                else
                    def.resolve();
            }

            doLoad();
            return def.promise();
        },

        /**
        * Загружает отдельный скрипт
        * @param {String} fileName Имя файла скрипта
        * @param {function} [callback] Ф-ция, которая будет вызвана после загрузки
        * @param {String} [charset=utf-8] Кодировка загружаемого файла
        * @returns {jQuery.Deferred}
        */
        loadScript: function(fileName, callback, charset)
        {
            var def = $.Deferred();
            lazyLoadLABjs().done(function()
            {
                var descr = {src: withCachePostfix(fileName)};
                if (charset) {
                    descr.charset = charset;
                }

                $LAB.script(descr).wait(function()
                {
                    def.resolve();
                    callback && callback();
                })
            })
            return def.promise();
        },

        /** Загрузить отдельный css файл
        * @param {String} cssFilename Имя css файла.
        */
        loadCSS: function(cssFilename)
        {
            var doLoadCss = function()
            {
                $.getCSS(withCachePostfix(cssFilename));
            }

            if ('getCSS' in $)
            {
                doLoadCss()
            }
            else
            {
                if (!cssLoader)
                {
                    var path = getScriptBase('gmxcore.js') || window.gmxJSHost || "";
                    cssLoader = $.getScript(path + "jquery/jquery.getCSS.js");
                }

                cssLoader.done(doLoadCss);
            }
        }
    }

    return publicInterface;
}();

window.gmxCore = window.gmxCore || gmxCore;

var nsGmx = nsGmx || {};
nsGmx.Utils = nsGmx.Utils || {};

(function()
{
    var domManipulation = {
        // _el(nodeName, [childs], [attrs])
        _el: function(str, childs, attributes)
        {
            var el = document.createElement(str),
                children = childs,
                attrs = attributes;

            if (children)
                domManipulation._childs(el, children)

            if (attrs && attrs.length)
                domManipulation._attr(el, attrs)

            return el;
        },
        // _t("some text")
        _t: function(str)
        {
            return document.createTextNode(String(str));
        },
        // children - всегда массив
        _childs: function(el, children)
        {
            for (var i = 0; i < children.length; ++i)
                el.appendChild(children[i]);
        },
        //[['css','width','100%']]
        //[['dir','className','name']]
        //[['attr','colSpan',2]]
        _attr: function(el, attrs)
        {
            for (var i = 0; i < attrs.length; ++i)
            {
                var atr = attrs[i],
                    type = atr[0];

                switch(type)
                {
                    case 'css':
                        (el.style[atr[1]] = atr[2]);
                        break;
                    case 'dir':
                        el[atr[1]] = atr[2];
                        break;
                    case 'attr':
                        el.setAttribute(atr[1], atr[2]);
                        break;
                }
            }
        },
        _table: function(children,attrs){return _el('TABLE',children,attrs)},
        _caption: function(children,attrs){return _el('CAPTION',children,attrs)},
        _thead: function(children,attrs){return _el('THEAD',children,attrs)},
        _tbody: function(children,attrs){return _el('TBODY',children,attrs)},
        _tfoot: function(children,attrs){return _el('TFOOT',children,attrs)},
        _textarea: function(children,attrs){return _el('TEXTAREA',children,attrs)},
        _th: function(children,attrs){return _el('TH',children,attrs);} ,
        _tr: function(children,attrs){return _el('TR',children,attrs);},
        _td: function(children,attrs){return _el('TD',children,attrs);},
        _span: function(children,attrs){return _el('SPAN',children,attrs);},
        _label: function(children,attrs){return _el('LABEL',children,attrs);},
        _li: function(children,attrs){return _el('LI',children,attrs);},
        _ul: function(children,attrs){return _el('UL',children,attrs);},
        _div: function(children,attrs){return _el('DIV',children,attrs);},
        _radio: function(attrs){return _el('INPUT',null,(attrs&&attrs.concat([['attr','type','radio']]))||[['attr','type','radio']])},
        _button: function(children,attrs){return _el('BUTTON',children,attrs)},
        _a: function(children,attrs){return _el('A',children,attrs)},
        _select: function(children,attrs){return _el('SELECT',children,attrs)},
        _option: function(children,attrs){return _el('OPTION',children,attrs);},
        _form: function(children,attrs){return _el('FORM',children,attrs)},
        _iframe: function(children,attrs){return _el('IFRAME',children,attrs)},
        _image: function(children,attrs){return _el('IMG',children,attrs)},
        _img: function(children,attrs){return _el('IMG',children,attrs)},
        _br: function(){return _el('BR')},
        _hr: function(){return _el('HR')},
        _p: function(children,attrs){return _el('P',children,attrs)},
        _b: function(children,attrs){return _el('B',children,attrs)},
        _i: function(children,attrs){return _el('I',children,attrs)},
        _input: function(children,attrs){return _el('INPUT',children,attrs)}
    }

    var _el = domManipulation._el;

    // _(elem, [childs], [attrs])
    var _ = function(ent,childs,attributes)
    {
        var el = ent,
            children = childs,
            attrs = attributes;

        if (children)
            domManipulation._childs(el, children)

        if (attrs && attrs.length)
            domManipulation._attr(el, attrs)

        return el;
    };

    var prevGlobals = {};
    for (var k in domManipulation) {
        prevGlobals[k] = window[k];
    }

    /** Удаляет из глобальной видимости часть методов, записанных туда при загрузке utilities.js
    * @memberOf nsGmx.Utils
    */
    nsGmx.Utils.noConflicts = function() {
        for (var k in domManipulation) {
            window[k] = prevGlobals[k];
        }
        return nsGmx.Utils;
    }

    jQuery.extend(window, domManipulation);      //для обратной совместимости
    jQuery.extend(nsGmx.Utils, domManipulation);
    nsGmx.Utils._ = _;
})();

if (window.Node && window.Node.prototype)
{
	Node.prototype.removeNode = function()
	{
		var parent = this.parentNode;
		parent && parent.removeChild(this);
	}
}

function getkey(e)
{
	if (window.event)
		return window.event.keyCode;
	else if (e)
		return e.which;
	else
		return null;
}

function show(elem)
{
	elem.style.display = '';
}
function hide(elem)
{
	elem.style.display = 'none';
}
function hidden(elem)
{
	elem.style.visibility = 'hidden';
}
function visible(elem)
{
	elem.style.visibility = 'visible';
}
function switchSelect(sel, value)
{
	if (!sel.options || !sel.options.length)
		return sel;

	for (var i = 0; i < sel.options.length; i++)
	{
		if (value == sel.options[i].value)
		{
			sel.options[i].selected = true;

			sel.selectedIndex = i;

			break;
		}
	}

	return sel;
}
function objLength(obj)
{
	var cnt = 0;
	for (var field in obj) cnt++;

	return cnt;
}
function valueInArray(arr, value)
{
	for (var i = 0; i < arr.length; i++)
		if (arr[i] == value)
			return true;

	return false;
}
function getOffsetRect(elem)
{
    var box = elem.getBoundingClientRect(),
    	body = document.body,
    	docElem = document.documentElement,
    	scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop,
    	scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft,
    	clientTop = docElem.clientTop || body.clientTop || 0,
    	clientLeft = docElem.clientLeft || body.clientLeft || 0,
    	top  = box.top +  scrollTop - clientTop,
    	left = box.left + scrollLeft - clientLeft;

    return { top: Math.round(top), left: Math.round(left) }
}
function attachEffects(elem, className)
{
	elem.onmouseover = function()
	{
		jQuery(this).addClass(className)
	}
	elem.onmouseout = function(e)
	{
		var evt = e || window.event,
			target = evt.srcElement || evt.target,
			relTarget = evt.relatedTarget || evt.toElement;

		try
		{
			while (relTarget)
			{
				if (relTarget == elem)
					return;
				relTarget = relTarget.parentNode;
			}

			jQuery(elem).removeClass(className)
		}
		catch (e)
		{
			jQuery(elem).removeClass(className)
		}
	}
}
function makeButton(value, id)
{
	var inp = _input(null, [['dir','className','btn'],['attr','type','submit'],['attr','value',value]]);
	if (typeof id != 'undefined' && id != null)
		inp.id = id;

	inp.style.padding = '0px 5px';

	return inp;
}
function makeImageButton(url, urlHover)
{
	var btn = _img();
	btn.setAttribute('src',url)
	btn.style.cursor = 'pointer';
	btn.style.border = 'none';

	if (urlHover)
	{
		btn.onmouseover = function()
		{
			this.setAttribute('src', urlHover);
		}
		btn.onmouseout = function()
		{
			this.setAttribute('src', url);
		}
	}

	return btn;
}
function makeLinkButton(text)
{
	var span = _span([_t(String(text))],[['dir','className','buttonLink']]);

	attachEffects(span, 'buttonLinkHover')

	return span;
}
function makeHelpButton(helpText){
	var btn = makeImageButton(getAPIHostRoot() + 'api/img/help.gif');
	btn.setAttribute('title', helpText)
	btn.onclick = function(){
		showDialog('', _t(helpText), 300, 150);
	}
	return btn;
}

function getOwnChildNumber(elem)
{
	for (var i = 0; i < elem.parentNode.childNodes.length; i++)
		if (elem == elem.parentNode.childNodes[i])
			return i;
}
function stopEvent(e)
{
	if(!e) var e = window.event;

	//e.cancelBubble is supported by IE - this will kill the bubbling process.
	e.cancelBubble = true;
	e.returnValue = false;

	//e.stopPropagation works only in Firefox.
	if (e.stopPropagation)
	{
		e.stopPropagation();
		e.preventDefault();
	}
	return false;
}

//Показывает диалог (на основе jQuery UI dialog)
//Параметры можно передавать явно и в виде объекта params:
//1. showDialog(title, content, width, height, ?posX, ?posY, ?resizeFunc, ?closeFunc)
//2. showDialog(title, content, params)
//Параметры:
// - title {string} Заголовок диалога
// - content {HTMLDomElement} контент диалога
// - width, height {int} высота и ширина диалога (обязательные параметры!)
// - posX, posY {int} положение диалога относительно экрана. Если не задано - по центру
// - resizeFunc {function} будет вызываться при изменении размера диалога. Аргумент ф-ции - объект с атриубтами width и height
// - closeFunc {function} будет вызываться при закрытии диалога
// - setMinSize {bool} если true (по умолчанию), будут заданы минимальная ширина и высота, равные начальным размерам (width, height)
function showDialog(title, content, width, height, posX, posY, resizeFunc, closeFunc)
{
    var params = null;
    if (arguments.length == 3)
    {
        params = $.extend({
            posX: false,
            posY: false,
            setMinSize: true
        }, width);
    }
    else
    {
        params = {
            width: width,
            height: height,
            posX: posX,
            posY: posY,
            resizeFunc: resizeFunc,
            closeFunc: closeFunc,
            setMinSize: true
        }
    }
	var canvas = _div([content]);

	document.body.appendChild(canvas);

	var dialogParams = {
        width: params.width,
        height: params.height,
        title: title,
        position: params.posX == false ? 'center' : [params.posX, params.posY],
        resizable: true,
        resize: function(event, ui)
        {
            params.resizeFunc && params.resizeFunc(ui.size);
        },
        close: function(ev, ui)
        {
            if (params.closeFunc && params.closeFunc())
                return;

            removeDialog(canvas);
        },
        closeText: null
    };

    if (params.setMinSize)
    {
        dialogParams.minWidth = params.width;
        dialogParams.minHeight = params.height;
    }

    jQuery(canvas).dialog(dialogParams);

	var dialog = canvas.parentNode;
	dialog.style.overflow = '';

	jQuery(dialog).children("div.ui-resizable-se").removeClass("ui-icon")
				.removeClass("ui-icon-gripsmall-diagonal-se")
				.removeClass("ui-icon-grip-diagonal-se");

	return canvas;
}

function removeDialog(canvas)
{
	jQuery(canvas).dialog('destroy').remove();
}

function showErrorMessage(message, removeFlag, title)
{
	var canvas = _div([_t(message)],[['dir','className','errorDialog']]);
        jQueryDiv = showDialog(title || "Ошибка!", canvas, {
            width: 250,
            height: 150,
            closeFunc: function(){
                canvas = null;
            }
        });

	if (removeFlag)
	{
		setTimeout(function()
		{
			if (canvas)
			{
                jQuery(jQueryDiv).dialog("destroy");
				jQuery(canvas.parentNode).remove();
			}
		}, 2500)
	}
}

window.showErrorMessage = showErrorMessage

function _checkbox(flag, type, name)
{
	var box = _input(null, [['attr','type',type]]);
    box.checked = flag;

    if (name)
        box.setAttribute('name', name);

	return box;
}

function insertAtCursor(myField, myValue, sel)
{
    if (myField.id && window.tinyMCE && tinyMCE.get(myField.id)) {
        tinyMCE.execInstanceCommand(myField.id, "mceInsertContent", false, myValue);
        return;
    }

	if (document.selection)
	{
		if (typeof sel != 'undefined')
			sel.text = myValue;
		else
		{
			myField.focus();
			var sel = document.selection.createRange();
			sel.text = myValue;
		}
	}
	else if (myField.selectionStart || myField.selectionStart == '0')
	{
		var startPos = myField.selectionStart,
			endPos = myField.selectionEnd;

		myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
	}
	else
		myField.value += myValue;
}

/* ----------------------------- */
function sendRequest(url, callback, body)
{
	var xmlhttp;
	if (typeof XMLHttpRequest != 'undefined')
		xmlhttp = new XMLHttpRequest();
	else
		try { xmlhttp = new ActiveXObject("Msxml2.XMLHTTP"); }
		catch (e) { try {xmlhttp = new ActiveXObject("Microsoft.XMLHTTP"); } catch (E) {}}

	xmlhttp.open(body ? "POST" : "GET", url, true);
	if (body)
	{
		xmlhttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xmlhttp.setRequestHeader('Content-length', body.length);
	}
	xmlhttp.onreadystatechange = function() { if (xmlhttp.readyState == 4) callback(xmlhttp); }
	xmlhttp.send(body || "");
}

function sendJSONRequest(url, callback)
{
	sendRequest(url, function(xmlhttp)
	{
		var text = xmlhttp.responseText;
		callback(JSON.parse(text));
	});
}

nsGmx.Utils.uniqueGlobalName = (function()
{
    var freeid = 0;
    return function(thing)
    {
        var id = 'gmx_unique_' + freeid++;
        window[id] = thing;
        return id;
    }
})();

/** Посылает кросс-доменный GET запрос к серверу с использованием транспорта JSONP.
 *
 * @memberOf nsGmx.Utils
 * @param {String} url URL сервера.
 * @param {Function} callback Ф-ция, которая будет вызвана при получении от сервера результата.
 * @param {String} [callbackParamName=CallbackName] Имя параметра для задания имени ф-ции ответа.
 * @param {Function} [errorCallback] Ф-ция, которая будет вызвана в случае ошибки запроса к серверу
 */
function sendCrossDomainJSONRequest(url, callback, callbackParamName, errorCallback)
{
	callbackParamName = callbackParamName || 'CallbackName';

    var script = document.createElement("script");
	script.setAttribute("charset", "UTF-8");
	var callbackName = nsGmx.Utils.uniqueGlobalName(function(obj)
	{
		callback && callback(obj);
		window[callbackName] = false;
		document.getElementsByTagName("head").item(0).removeChild(script);
	});

    var sepSym = url.indexOf('?') == -1 ? '?' : '&';

    if (errorCallback) {
        script.onerror = errorCallback;
    }

	script.setAttribute("src", url + sepSym + callbackParamName + "=" + callbackName + "&" + Math.random());
	document.getElementsByTagName("head").item(0).appendChild(script);
}

function createCookie(name, value, days)
{
	if (days)
	{
		var date = new Date();
		date.setTime(date.getTime() + (days*24*60*60*1000));
		var expires = "; expires=" + date.toGMTString();
	}
	else
		var expires = "";
	document.cookie = name + "=" + value + expires + "; path=/";
}

function readCookie(name)
{
	var nameEQ = name + "=";
	var ca = document.cookie.split(';');
	for(var i = 0; i < ca.length; i++)
	{
		var c = ca[i];
		while (c.charAt(0)==' ')
			c = c.substring(1, c.length);
		if (c.indexOf(nameEQ) == 0)
			return c.substring(nameEQ.length, c.length);
	}
	return null;
}

function eraseCookie(name)
{
	createCookie(name, "", -1);
}

function getWindowWidth()
{
	var myWidth = 0;

	if (typeof (window.innerWidth) == 'number')
		myWidth = window.innerWidth;
	else if (document.documentElement && (document.documentElement.clientWidth || document.documentElement.clientHeight))
		myWidth = document.documentElement.clientWidth;
	else if (document.body && (document.body.clientWidth || document.body.clientHeight))
	{
		myWidth = document.body.clientWidth;
	}

	return myWidth;
}

function getWindowHeight()
{
	var myHeight = 0;

	if (typeof (window.innerWidth) == 'number' )
		myHeight = window.innerHeight;
	else if (document.documentElement && (document.documentElement.clientWidth || document.documentElement.clientHeight))
		myHeight = document.documentElement.clientHeight;
	else if (document.body && (document.body.clientWidth || document.body.clientHeight))
		myHeight = document.body.clientHeight;

	return myHeight;
}

function strip(s)
{
	return s.replace(/^\s*/, "").replace(/\s*$/, "");
}

(function() {
    var replacements = {};
    var temp;
    for (var rus in (temp = {
        "qwertyuiopasdfghjklzxcvbnm_1234567890" :
        "qwertyuiopasdfghjklzxcvbnm_1234567890",
        "абвгдезийклмнопрстуфыэ ":
        "abvgdeziyklmnoprstufye_",
        "ёжчхцшщюя":
        "yozhchkhtsshshyuya",
        "ьъ":
        "",
        ".":
        "."
    }))
    {
        var eng = temp[rus],
            k = eng.length/rus.length;
        for (var i = 0; i < rus.length; i++)
        {
            var r = rus.substring(i, i + 1),
                e = eng.substring(i*k, (i + 1)*k);
            replacements[r] = e;
            replacements[r.toUpperCase()] = e.toUpperCase();
        }
    }

    nsGmx.Utils.translit = function(name)
    {
        var result = "";
        for (var i = 0; i < name.length; i++)
            result += (replacements[name.substring(i, i + 1)] || "");

        return result;
    }
})();

function loadFunc(iframe, callback)
{
	var win = iframe.contentWindow;

    //skip first onload in safari
    if ( jQuery.browser.safari && !iframe.safariSkipped)
    {
        iframe.safariSkipped = true;
        return;
    }

	if (iframe.loaded)
	{
		var data = decodeURIComponent(win.name.replace(/\n/g,'\n\\'));
        jQuery(iframe).remove();

		var parsedData;
		try
		{
			parsedData = JSON.parse(data)
		}
		catch(e)
		{
			parsedData = {Status:"error",ErrorInfo: {ErrorMessage: "JSON.parse exeption", ExceptionType:"JSON.parse", StackTrace: data}}
		}

		callback && callback(parsedData);
	}
	else
	{
		win.location = 'about:blank';
        iframe.loaded = true;
	}

}

function createPostIframe(id, callback)
{
	var userAgent = navigator.userAgent.toLowerCase(),
		callbackName = nsGmx.Utils.uniqueGlobalName(function()
		{
			loadFunc(iframe, callback);
		}),
		iframe;

	try {
		iframe = document.createElement('<iframe style="display:none" onload="' + callbackName + '()" src="javascript:true" id="' + id + '" name="' + id + '"></iframe>');
    }
	catch(e)
	{
		iframe = document.createElement("iframe");
		iframe.style.display = 'none';
		iframe.setAttribute('id', id);
		iframe.setAttribute('name', id);
		iframe.src = 'javascript:true';
		iframe.onload = window[callbackName];
	}

	return iframe;
}

!function() {
    var requests = {},
        lastRequestId = 0,
        uniquePrefix = 'id' + Math.random();

    var processMessage = function(e) {
        if (!(e.origin in requests)) {
            return;
        }

        var dataStr = decodeURIComponent(e.data.replace(/\n/g,'\n\\'));
        try {
            var dataObj = JSON.parse(dataStr);
        } catch (e) {
            request.callback && request.callback({Status:"error", ErrorInfo: {ErrorMessage: "JSON.parse exeption", ExceptionType: "JSON.parse", StackTrace: dataStr}});
        }
        var request = requests[e.origin][dataObj.CallbackName];
        if(!request) return;    // message от других запросов

        delete requests[e.origin][dataObj.CallbackName];
        delete dataObj.CallbackName;

        request.iframe.parentNode.removeChild(request.iframe);
        request.callback && request.callback(dataObj);
    }

    //совместимость с IE8
    if (window.addEventListener) {
        window.addEventListener('message', processMessage);
    } else {
        window.attachEvent('onmessage', processMessage);
    }

    //скопирована из API для обеспечения независимости от него
    var parseUri = function (str) {
        var	o   = parseUri.options,
            m   = o.parser[o.strictMode ? 'strict' : 'loose'].exec(str),
            uri = {},
            i   = 14;

        while (i--) {
            uri[o.key[i]] = m[i] || '';
        }

        uri[o.q.name] = {};
        uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
            if ($1) { uri[o.q.name][$1] = $2; }
        });

        uri.hostOnly = uri.host;
        uri.host = uri.authority; // HACK

        return uri;
    };

    parseUri.options = {
        strictMode: false,
        key: ['source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'],
        q:   {
            name:   'queryKey',
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
        }
    };

    function createPostIframe2(id, callback, url)
    {
        var uniqueId = uniquePrefix + (lastRequestId++);

        iframe = document.createElement("iframe");
        iframe.style.display = 'none';
        iframe.setAttribute('id', id);
        iframe.setAttribute('name', id);
        iframe.src = 'javascript:true';
        iframe.callbackName = uniqueId;
        //iframe.onload = window[callbackName];

        var parsedURL = parseUri(url);
        var origin = (parsedURL.protocol ? (parsedURL.protocol + ':') : window.location.protocol) + '//' + (parsedURL.host || window.location.host);

        requests[origin] = requests[origin] || {};
        requests[origin][uniqueId] = {callback: callback, iframe: iframe};

        return iframe;
    }

    window.createPostIframe2 = createPostIframe2;

}();

/** Посылает кроссдоменный POST запрос
*
* @memberOf nsGmx.Utils
* @param {String} url URL запроса
* @param {Object} params Хэш параметров-запросов
* @param {Function} [callback] Callback, который вызывается при приходе ответа с сервера. Единственный параметр ф-ции - собственно данные
* @param {DOMElement} [baseForm] базовая форма запроса. Используется, когда нужно отправить на сервер файл.
*                                В функции эта форма будет модифицироваться, но после отправления запроса будет приведена к исходному виду.
*/
function sendCrossDomainPostRequest(url, params, callback, baseForm)
{
	var form,
		rnd = String(Math.random()),
		id = '$$iframe_' + url + rnd;

	var iframe = createPostIframe2(id, callback, url),
        originalFormAction;

	if (baseForm)
	{
		form = baseForm;
        originalFormAction = form.getAttribute('action');
		form.setAttribute('action', url);
		form.target = id;

	}
	else
	{
		try {
			form = document.createElement('<form id=' + id + '" enctype="multipart/form-data" style="display:none" target="' + id + '" action="' + url + '" method="post"></form>');
        }
		catch (e)
		{
			form = document.createElement("form");
			form.style.display = 'none';
			form.setAttribute('enctype', 'multipart/form-data');
			form.target = id;
			form.setAttribute('method', 'POST');
			form.setAttribute('action', url);
			form.id = id;
		}
	}

    var hiddenParamsDiv = document.createElement("div");
    hiddenParamsDiv.style.display = 'none';

    if (params.WrapStyle === 'window') {
        params.WrapStyle = 'message';
    }

    if (params.WrapStyle === 'message') {
        params.CallbackName = iframe.callbackName;
    }

	for (var paramName in params)
	{
		var input = document.createElement("input");

        var value = typeof params[paramName] !== 'undefined' ? params[paramName] : '';

		input.setAttribute('type', 'hidden');
		input.setAttribute('name', paramName);
		input.setAttribute('value', value);

		hiddenParamsDiv.appendChild(input)
	}

    form.appendChild(hiddenParamsDiv);

	if (!baseForm)
		document.body.appendChild(form);

	document.body.appendChild(iframe);

	form.submit();

    if (baseForm)
    {
        form.removeChild(hiddenParamsDiv);
        if (originalFormAction !== null)
            form.setAttribute('action', originalFormAction);
        else
            form.removeAttribute('action');
    }
    else
    {
        form.parentNode.removeChild(form);
    }
}

(function() {

    var hooks = {};

    /** Добавляет "хук", который будет вызван при ответе сервера соответвующего типа
    * @param type {object} - тип хука (соответствует полю "Status" ответа сервера) или '*' - добавить к любому ответу
    * @param hookFunction {function(response, customErrorDescriptions)} - собственно хук
    */
    window.addParseResponseHook = function(type, hookFunction) {
        hooks[type] = hooks[type] || [];
        hooks[type].push(hookFunction);
    }

    /** Обрабатывает результат выполнения серверного скрипта.
    * Для выполнения действий вызывает "хуки" соответствующиего типа, добавленные через addParseResponseHook()
    * @function
    * @global
    * @param {object} response JSON, вернувшийся с сервера
    * @param {object} customErrorDescriptions хэш "тип ошибки" -> "кастомное сообщение пользователям".
    * @return true, если статус ответа "ok", иначе false
    */
    window.parseResponse = function(response, customErrorDescriptions)
    {
        var responseHooks = (hooks[response.Status] || []).concat(hooks['*'] || []);
        for (var h = 0; h < responseHooks.length; h++)
            responseHooks[h](response, customErrorDescriptions);

        return response.Status == 'ok';
    }

})();

function _title(elem, title)
{
	elem.setAttribute('title', title);
}

function parseXML(str)
{
	var xmlDoc;
	try
	{
		if (window.DOMParser)
		{
			parser = new DOMParser();
			xmlDoc = parser.parseFromString(str,"text/xml");
		}
		else // Internet Explorer
		{
			xmlDoc = new ActiveXObject("MSXML2.DOMDocument.3.0");
			xmlDoc.validateOnParse = false;
			xmlDoc.async = false;
			xmlDoc.loadXML(str);
		}
	}
	catch(e)
	{
		alert(e)
	}

	return xmlDoc;
}

function disableSelection(target)
{
	if (typeof target.onselectstart != "undefined")
	    target.onselectstart = function(){return false}
	else if (typeof target.style.MozUserSelect != "undefined")
	    target.style.MozUserSelect = "none"
	else
	    target.onmousedown = function(){return false}
}

function parsePropertiesDate(str)
{
	if (str == null || str == "")
		return 0;

	var dateParts = str.split('.');

	if (dateParts.length != 3)
		return 0;

	return new Date(dateParts[2], dateParts[1] - 1, dateParts[0]).valueOf();
}

function stringDate(msec, isUtc)
{
	var date = new Date(msec);
		excDate = isUtc ? date.getUTCDate() : date.getDate(),
		excMonth = (isUtc ? date.getUTCMonth() : date.getMonth()) + 1,
		excYear = isUtc ? date.getUTCFullYear() : date.getFullYear();

	return (excDate < 10 ? '0' + excDate : excDate) + '.' + (excMonth < 10 ? '0' + excMonth : excMonth) + '.' + excYear;
}

function stringTime(msec, isUtc)
{
	var date = new Date(msec);
		excHour = isUtc ? date.getUTCHours() : date.getHours(),
		excMin = isUtc ? date.getUTCMinutes() : date.getMinutes(),
		excSec = isUtc ? date.getUTCSeconds() : date.getSeconds();

	return (excHour < 10 ? '0' + excHour : excHour) + ':' + (excMin < 10 ? '0' + excMin : excMin) + ':' + (excSec < 10 ? '0' + excSec : excSec);
}

function stringDateTime(msec, isUtc)
{
	return stringDate(msec, isUtc) + ' ' + stringTime(msec, isUtc);
}

/** Подсвечивает красным input, убирает подсветку через некоторое время
*
* @param {HTMLDOMElement|Array<HTMLDOMElement>} input - целевой input-элемент или массив таких элементов
* @param {integer} delay - время подсвечивания ошибки в миллисекундах
*/
function inputError(input, delay)
{
    delay = delay || 1000;
    if (!jQuery.isArray(input))
        input = [input];

    for (var k = 0; k < input.length; k++)
        jQuery(input[k]).addClass('error');

	setTimeout(function()
	{
        for (var k = 0; k < input.length; k++)
            if (input[k])
                jQuery(input[k]).removeClass('error');
	}, delay)
}

function equals(x, y)
{
	for(p in y)
	{
	    if(typeof(x[p])=='undefined') {return false;}
	}

	for(p in y)
	{
	    if (y[p])
	    {
	        switch(typeof(y[p]))
	        {
	                case 'object':
	                        if (!equals(x[p], y[p])) { return false }; break;
	                case 'function':
	                        if (typeof(x[p])=='undefined' || (p != 'equals' && y[p].toString() != x[p].toString())) { return false; }; break;
	                default:
	                        if (y[p] != x[p]) { return false; }
	        }
	    }
	    else
	    {
	        if (x[p])
	        {
	            return false;
	        }
	    }
	}

	for(p in x)
	{
	    if(typeof(y[p])=='undefined') {return false;}
	}

	return true;
}

/**
    @namespace nsGmx.Utils
    @description Разнообразные вспомогательные ф-ции
*/
$.extend(nsGmx.Utils, {

    /**
        Возвращает уникальную строку (16 символов из букв и латинских цифр)
        @function
        @memberOf nsGmx.Utils
    */
    generateUniqueID: function()
    {
        var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz",
            randomstring = '';

        for (var i = 0; i < 16; i++)
        {
            var rnum = Math.floor(Math.random() * chars.length);
            randomstring += chars.charAt(rnum);
        }

        return randomstring;
    },
    /**
        Преобразует цвет, заданный в виде числа (0xaabbcc) в строку вида #aabbcc
        @function
        @memberOf nsGmx.Utils
    */
    convertColor: function(intColor)
    {
        var r,g,b;

        b = (intColor % 256).toString(16);
        if (b.length == 1)
            b = '0' + b;

        intColor = Math.floor(intColor / 256);
        g = (intColor % 256).toString(16);
        if (g.length == 1)
            g = '0' + g;

        intColor = Math.floor(intColor / 256);
        r = (intColor % 256).toString(16);
        if (r.length == 1)
            r = '0' + r;

        return '#' + r + g + b;
    },

	/** Возвращает позицию окна такую, чтобы окно не мешало текущему элементу
        @memberOf nsGmx.Utils
    */
	getDialogPos: function(div, offsetFlag, height)
	{
		var pos = getOffsetRect(div),
			left = pos.left + 30,
			top = pos.top - 10,
			windowHeight = getWindowHeight();

		if (offsetFlag)
		{
			$(div).children('div,img').each(function()
			{
				if (!this.getAttribute('multiStyle'))
					left += this.offsetWidth;
			})
		}

		if (top + 15 + height > windowHeight)
			top -= (top + 15 + height - windowHeight);

		return {left: left, top: top}
	},

	/** Устанавливает обычный стиль и генерит похожий стиль при наведении мышки
    @memberOf nsGmx.Utils
	@param layer {L.gmxVectorLayer} Слой
	@param styleIndex {Number} Номер стиля слоя
	@param templateStyle {Style} Стиль, похожий на который надо установить*/
	setMapObjectStyle: function(layer, styleIndex, templateStyle)
	{
        var hoverStyle = $.extend(true, {}, templateStyle);
        var style = layer.getStyle(styleIndex);

        if (templateStyle.outline && typeof templateStyle.outline.thickness != 'undefined')
            hoverStyle.outline.thickness = Number(templateStyle.outline.thickness) + 1;

        if (templateStyle.fill && typeof templateStyle.fill.opacity != 'undefined' && templateStyle.fill.opacity > 0)
            hoverStyle.fill.opacity = Math.min(Number(templateStyle.fill.opacity + 20), 100);

        var newStyle = $.extend(true, {}, style);
        newStyle.RenderStyle = L.gmxUtil.fromServerStyle(templateStyle);
        newStyle.HoverStyle = L.gmxUtil.fromServerStyle(hoverStyle);

        layer.setStyle(newStyle, styleIndex);
	},

    // берёт стиль в формате сервера, добавляет в него hover-подсветку
    // и возвращает этот стиль в новом формате Leafelt-Geomixer
    prepareGmxLayerStyle: function(style)
	{
        var templateStyle = style.RenderStyle,
            newStyle = $.extend(true, {}, style),
            hoverStyle = $.extend(true, {}, templateStyle);


        if (templateStyle.outline && typeof templateStyle.outline.thickness != 'undefined')
            hoverStyle.outline.thickness = Number(templateStyle.outline.thickness) + 1;

        if (templateStyle.fill && typeof templateStyle.fill.opacity != 'undefined' && templateStyle.fill.opacity > 0)
            hoverStyle.fill.opacity = Math.min(Number(templateStyle.fill.opacity + 20), 100);

        newStyle.RenderStyle = L.gmxUtil.fromServerStyle(templateStyle);
        newStyle.HoverStyle = L.gmxUtil.fromServerStyle(hoverStyle);

        return newStyle;
	},
    /** Конвертация данных между форматами сервера и клиента. Используется в тегах слоёв и в атрибутах объектов векторных слоёв.
    *
    * Форматы сервера:
    *
    *  * datetime - unix timestamp
    *  * date - unix timestamp, кратный 24*3600 секунд
    *  * time - кол-во секунд с полуночи
    *
    * Форматы клиента:
    *
    *  * все числа превращаются в строки
    *  * дата - строка в формате dd.mm.yy
    *  * время - строка в формате hh:mm:ss
    *  * дата-время - dd.mm.yy hh:mm:ss
    *
    * @memberOf nsGmx.Utils
    */
    convertFromServer: function(type, value)
    {
        //if (value === null) return "null";

        if (!type) {
            return value;
        }

        var lowerCaseType = type.toLowerCase();

        if (lowerCaseType == 'string')
        {
            return value !== null ? value : ''; //все null интерпретируем как пустые строки!
        }
        else if (lowerCaseType == 'integer' || lowerCaseType == 'float' || lowerCaseType == 'number')
        {
            return value !== null ? String(value) : '';
        }
        else if (lowerCaseType == 'date')
        {
            if (value === null) return '';

            return stringDate(value*1000, true);
        }
        else if (lowerCaseType == 'time')
        {
            if (value === null) return '';
            return stringTime(value*1000, true);
        }
        else if (lowerCaseType == 'datetime')
        {
            if (value === null) return '';
            return stringDateTime(value*1000, true);
        }

        return value;
    },

    /** Конвертация данных между форматами сервера и клиента. Используется в тегах слоёв и в атрибутах объектов векторных слоёв.
    * Описание форматов см. в {@link nsGmx.Utils.convertFromServer}
    * Если конвертация невозможна для данного типа, возвращает null
    * @memberOf nsGmx.Utils
    */
    convertToServer: function(type, value)
    {
        if (!type) {
            return value;
        }

        var lowerCaseType = type.toLowerCase();

        if (lowerCaseType == 'string')
        {
            return value;
        }
        else if (lowerCaseType == 'integer' || lowerCaseType == 'float' || lowerCaseType == 'number')
        {
            if (value === '') return null;
            var num = Number(value);
            return isNaN(num) ? null : num;
        }
        else if (lowerCaseType == 'date')
        {
            var localDateValue = $.datepicker.parseDate('dd.mm.yy', value);
            if (localDateValue === null) return null;

            var localValue = localDateValue.valueOf()/1000;
            var timeOffset = (new Date(localValue*1000)).getTimezoneOffset()*60;
            return localValue - timeOffset;
        }
        else if (lowerCaseType == 'time')
        {
            var resTime = $.datepicker.parseTime('HH:mm:ss', value);
            if (!resTime) return null;

            return resTime.hour*3600 + resTime.minute*60 + resTime.second;
        }
        else if (lowerCaseType == 'datetime')
        {
            var localDateValue = $.datepicker.parseDateTime('dd.mm.yy', 'HH:mm:ss', value);
            if (localDateValue === null) return null;

            var localValue = localDateValue.valueOf()/1000;
            var timeOffset = (new Date(localValue*1000)).getTimezoneOffset()*60;
            return localValue - timeOffset;
        }

        return value;
    },


	login: function(redirect_uri, authServerBase, callback, authServer, isHidden){
		var oAuthServer = authServer || 'MyKosmosnimki';
		window.gmxGetServerBase = function(){
			return authServerBase
		}
		var redirectUri = redirect_uri + (redirect_uri.indexOf('?')>0 ? '&' : '?') + 'authServer=' + oAuthServer;
		window.gmxProcessAuthentication = function(userInfo){
			callback && callback(userInfo);
		}
		var features, w = 600, h = 350, l, t;
		var handlerName = 'LoginDialog';
		if (oAuthServer != 'MyKosmosnimki') {
			handlerName += oAuthServer;
			h = 400;
		}
		var url = authServerBase + handlerName + '.ashx?redirect_uri=' + escape(redirectUri);

		if (!isHidden){
			var top = (screen.height - h)/2, left = (screen.width - w)/2;
			features = 'location=0,menubar=0,resizable=0,status=0,toolbar=0,width='+w+',height='+h+',left='+left+',top='+top ;

			window.open(url, '_blank', features);
		}else{
			$('<iframe />', {
				 'src': url
				,'style': 'display: block !important; position: absolute; left: -99999px;'
			}).appendTo('body'); //стиль такой кривой иначе будет бага в FF
		}
    },

    /** Загружает пользовательский shp файл.
    * Проверяет на ошибки, выводит предупреждения и ошибки в виде стандартных диалогов.
    * @memberof nsGmx.Utils
    * @function
    * @param {File|Form} shpSource Либо форма с полем file, в которой пользователь выбрал файл, либо HTML5 File. Форма должна иметь атрибуты method="post" и enctype="multipart/form-data"
    * @return {jQuery.Deferred} Возвращает promise (аргумент ф-ции - массив объектов из shp файла)
    */
    parseShpFile: (function() //приватные данные
    {
        var translationsAdded = false;
        var addTranslationsLazy = function()
        {
            if (translationsAdded) return;
            _translationsHash.addtext("rus", {
                                "loadShape.Errors.FileTooBigException" : "Файл слишком большой. Ограничение на размер файла 1000 Кб.",
                                "loadShape.Errors.ErrorUploadExeption" : "Произошла ошибка при попытке загрузить файл.",
                                "loadShape.Errors.NoGeometryFile"      : "Загруженный файл не содержит геометрических данных.",
                                "loadShape.Errors.ErrorUploadNoDependentFiles" : "Не найдено необходимых зависимых файлов. Запакуйте все файлы в ZIP архив и повторите загрузку."
                             });

            _translationsHash.addtext("eng", {
                                "loadShape.Errors.FileTooBigException" : "Too big file. File size limit is 1000 Kb.",
                                "loadShape.Errors.ErrorUploadExeption" : "Error during file uploading.",
                                "loadShape.Errors.NoGeometryFile"      : "There are no geometry in uploaded file.",
                                "loadShape.Errors.ErrorUploadNoDependentFiles" : "Not found the necessary dependent files. Add all files in a ZIP archive and upload it again."
                             });

            translationsAdded = true;
        }

        //непосредственно ф-ция
        return function(shpFileForm) {
            var def = $.Deferred();

            addTranslationsLazy();

            var errorMessages = {
                "CommonUtil.FileTooBigException" : _gtxt("loadShape.Errors.FileTooBigException"),
                "CommonUtil.ErrorUploadExeption" : _gtxt("loadShape.Errors.ErrorUploadExeption"),
                "CommonUtil.NoGeometryFile"      : _gtxt("loadShape.Errors.NoGeometryFile"),
                "CommonUtil.ErrorUploadNoDependentFiles": _gtxt("loadShape.Errors.ErrorUploadNoDependentFiles")
            };

            if (window.File && shpFileForm instanceof window.File) {
                if (!window.FormData) {
                    def.reject();
                    return false;
                }

                var formData = new FormData();
                formData.append('file', shpFileForm);
                var xhr = new XMLHttpRequest();
                xhr.open('POST', serverBase + 'ShapeLoader.ashx');
                xhr.onload = function () {
                    if (xhr.status === 200) {
                        response = JSON.parse(xhr.responseText.substr(1, xhr.responseText.length-2));

                        if (parseResponse(response, errorMessages)) {
                            def.resolve(response.Result);
                        } else {
                            def.reject(response);
                        }
                        //console.log(response.Result);
                    }
                };

                xhr.send(formData);
            } else {
                sendCrossDomainPostRequest(serverBase + "ShapeLoader.ashx", {WrapStyle: "window"}, function(response)
                {
                    if (parseResponse(response, errorMessages))
                        def.resolve(response.Result);
                    else
                        def.reject(response);
                }, shpFileForm)
            }

            return def.promise();
        }

    })(),

    /** Позволяет скачать в браузере геометрию в одном из форматов (упакованный в zip архив).
    * @memberof nsGmx.Utils
    * @function
    * @param {Object[]} geoJSONFeatures Массив GeoJSON Features. К сожалению, другие типы GeoJSON объектов не поддерживаются.
    * @param {Object} [options] Доп. параметры
    * @param {String} [options.fileName=markers] Имя файла для скачивания
    * @param {String} [options.format=Shape] В каком формате скачать (Shape, Tab, gpx или несколько через запятую)
    */
    downloadGeometry: function(geoJSONFeatures, options) {
        var objectsByType = {},
            markerIdx = 1;

        options = $.extend({
            fileName: 'markers',
            format: 'Shape'
        }, options);

        geoJSONFeatures.forEach(function(item) {
            var geom = item.geometry,
                type = geom.type;

            objectsByType[type] = objectsByType[type] || [];

            var title = item.properties && item.properties.title || '';

            if (type == "Point" && !title) {
                title = "marker " + markerIdx++;
            }

            objectsByType[type].push({
                geometry: {
                    type: type.toUpperCase(),
                    coordinates: geom.coordinates
                },
                properties: {text: title}
            });
        });

        sendCrossDomainPostRequest(serverBase + "Shapefile", {
            name:     options.fileName,
            format:   options.format,
            points:   JSON.stringify(objectsByType["Point"] || []),
            lines:    JSON.stringify([].concat(objectsByType["LineString"] || [], objectsByType["MultiLineString"] || [])),
            polygons: JSON.stringify([].concat(objectsByType["Polygon"] || [], objectsByType["MultiPolygon"] || []))
        })
    },

    /** Объединяет массив полигонов/мультиполигонов в новый полигон/мультиполигон
    * @memberof nsGmx.Utils
    */
    joinPolygons: function(objs)
    {
        var polygonObjects = [];
        for (var i = 0; i < objs.length; i++)
        {
            var geom = objs[i];
            if (geom.type == 'POLYGON')
            {
                polygonObjects.push(geom.coordinates);
            }
            else if (geom.type == 'MULTIPOLYGON')
            {
                for (var iC = 0; iC < geom.coordinates.length; iC++)
                    polygonObjects.push(geom.coordinates[iC]);
            }
        }

        if (polygonObjects.length > 1)
            return {type: "MULTIPOLYGON", coordinates: polygonObjects}
        else if (polygonObjects.length == 1)
        {
            return {type: "POLYGON", coordinates: polygonObjects[0]}
        }
        else
            return null;
    },

    joinClippedPolygon: function(polygon) {

        if (polygon.type !== 'MULTIPOLYGON') {
            return polygon;
        }

        var origData = [],
            segmentsToJoin = [],
            joinedSegments = [],
            crossPoints = [],
            finalPolygon = [];

        var equal = function(a, b) {return Math.abs(a - b) < 1e-5;}

        var coords = polygon.coordinates;
        for (var c = 0; c < coords.length; c++) {
            for (var r = 0; r < coords[c].length; r++) {
                coords[c][r].length = coords[c][r].length - 1;
            }
        }

        var parseRing = function(origRing) {
            var segments = [],
                ring = origRing.coords,
                len = ring.length;

            var getNextSegment = function(i) {
                var il = (i - 1 + len) % len,
                    points = [];

                while (i != il) {
                    if (equal(Math.abs(ring[i][0]), 180) && equal(Math.abs(ring[(i+1)%len][0]), 180) ) {
                        return [i, points];
                    }

                    points.push(ring[i]);
                    i = (i + 1) % len;
                }

                return [i, points];
            }

            var segment = getNextSegment(0);

            var lastI = segment[0];

            if (!equal(Math.abs(ring[segment[0]][0]), 180)) {
                origRing.regularRing = ring;
                return;
            }

            do {
                startI = (segment[0] + 1) % len;
                segment = getNextSegment((startI + 1) % len);
                var nextSegment = {
                    points: [].concat([ring[startI]], segment[1], [ring[segment[0]]])
                }
                segmentsToJoin.push(nextSegment);
                origRing.segments.push(nextSegment);
            } while (segment[0] !== lastI);
        }

        var findSegment = function(y, joinedSeg) {
            for (var s = 0; s < segmentsToJoin.length; s++) {
                var seg = segmentsToJoin[s];
                if (equal(seg.points[0][1], y) || equal(seg.points[seg.points.length - 1][1], y)) {
                    segmentsToJoin.splice(s, 1);
                    seg.joinedSeg = joinedSeg;
                    var isReg = equal(seg.points[0][1], y);
                    return {
                        points: isReg ? seg.points.slice(1, seg.points.length - 1) : seg.points.slice(1, seg.points.length - 1).reverse(),
                        lastY: isReg ? seg.points[seg.points.length - 1][1] : seg.points[0][1]
                    };
                }
            }
        }

        var joinSegment = function(y0) {
            var res = {},
                seg = findSegment(y0, res),
                points = seg.points,
                crossPoints = [y0];

            while (seg.lastY !== y0) {
                crossPoints.push(seg.lastY);
                seg = findSegment(seg.lastY);
                points = points.concat(seg.points);
            };

            res.points = points,
            res.crossPoints = crossPoints,
            res.minCrossPoint = Math.min.apply(Math, crossPoints)

            return res;
        }

        var parseGeometry = function(geom) {
            for (var c = 0; c < geom.coordinates.length; c++) {
                var origComp = [];
                origData.push(origComp);
                var comp = geom.coordinates[c];
                for (var r = 0; r < comp.length; r++) {
                    var origRing = {
                        coords: comp[r],
                        segments: []
                    }
                    origComp.push(origRing);
                    parseRing(origRing);
                }
            }
        }

        parseGeometry(polygon);

        segmentsToJoin.forEach(function(segment) {
            if (segment.points[0][0] < 0) {
                segment.points = segment.points.map(function(c) { return [c[0] + 360, c[1]];});
            }
        })

        while (segmentsToJoin.length) {
            var y0 = segmentsToJoin[0].points[0][1];
            var joinedSeg = joinSegment(y0);
            joinedSegments.push(joinedSeg);
            crossPoints = crossPoints.concat(joinedSeg.crossPoints);
        }

        crossPoints = crossPoints.sort();

        joinedSegments = joinedSegments.sort(function(s1, s2) {
            return s1.minCrossPoint - s2.minCrossPoint;
        })

        joinedSegments.forEach(function(s, i) {
            s.isExternal = (crossPoints.indexOf(s.minCrossPoint) % 2) === 0;
        })

        //собираем объединённые сегменты в мультиполигон
        joinedSegments.forEach(function(s) {
            if (s.isExternal) {
                finalPolygon.push([s.points]);
            } else {
                finalPolygon[finalPolygon.length-1].push(s.points);
            }
            s.finalComponent = finalPolygon[finalPolygon.length-1];
        })

        //добавляем компоненты, которые не пересекались со 180 градусом
        for (var c = 0; c < origData.length; c++) {
            if (origData[c][0].regularRing) {
                console.log('external component', c)
                var geomToCopy = [];
                for (var r = 0; r < origData[c].length; r++) {
                    geomToCopy.push(origData[c][r].regularRing);
                }
                finalPolygon.push(geomToCopy);
                continue;
            }
            for (var r = 1; r < origData[c].length; r++) {
                if (origData[c][r].regularRing) {
                    console.log('internal component', c, r, origData[c][0].segments);
                    for (var s = 0; s < origData[c][0].segments.length; s++) {
                        var joinedSeg = origData[c][0].segments[s].joinedSeg;
                        if (joinedSeg.isExternal) {
                            joinedSeg.finalComponent.push(origData[c][r].regularRing);
                            break;
                        }
                    }
                }
            }
        }

        if (finalPolygon.length === 1) {
            return {type: 'POLYGON', coordinates: finalPolygon[0]};
        } else {
            return {type: 'MULTIPOLYGON', coordinates: finalPolygon};
        }
    },
    showDialog: window.showDialog,

    /** Методы для работы с сохранёнными на сервере данными.
    * Сервер позволяет сохранять произвольный текст на сервере и получить ID, по которому можно этот текст получить.
    * Используется для формирования пермалинков (сохранение состояния)
    * @namespace
    * @memberOf nsGmx.Utils
    */
    TinyReference: {
        /** Создать новую ссылку
        * @param {String} data Данные, которые нужно сохранить
        * @return {jQuery.Deferred} Промис, который будет resolve при сохранении данных. Параметр при ресолве: ID, по которому можно получить данные обратно
        */
        create: function(data) {
            var def = $.Deferred();
            sendCrossDomainPostRequest(serverBase + "TinyReference/Create.ashx", {
                WrapStyle: 'message',
                content: JSON.stringify(data)
            },
            function(response) {
                if (parseResponse(response)) {
                    def.resolve(response.Result);
                } else {
                    def.reject();
                }
            })

            return def.promise();
        },

        /** Получить ранее сохранённые данные по ID
        * @param {String} id полученный при сохранении ID данных
        * @return {jQuery.Deferred} Промис, который будет resolve при получении данных. Параметр при ресолве: данные с сервера
        */
        get: function(id) {
            var def = $.Deferred();
            sendCrossDomainJSONRequest(serverBase + "TinyReference/Get.ashx?id=" + id, function(response){
                //если пермалинк не найден, сервер не возвращает ошибку, а просто пустой результат
                if (parseResponse(response) && response.Result) {
                    def.resolve(JSON.parse(response.Result));
                } else {
                    def.reject();
                }
            });

            return def.promise();
        },

        /** Удалить данные по ID
        * @param {String} id полученный при сохранении ID данных
        * @return {jQuery.Deferred} Промис, который будет resolve при удалении данных
        */
        remove: function(id) {
            var def = $.Deferred();
            sendCrossDomainJSONRequest(serverBase + "TinyReference/Delete.ashx?id=" + id, function(response){
                if (parseResponse(response)) {
                    def.resolve();
                } else {
                    def.reject();
                }
            });

            return def.promise();
        }
    },
    isIpad: function() {
        return navigator.userAgent.match(/iPad/i) != null;
    }
});

window.gmxCore && window.gmxCore.addModule('utilities', nsGmx.Utils);

/*
 * Treeview 1.4 - jQuery plugin to hide and show branches of a tree
 * 
 * http://bassistance.de/jquery-plugins/jquery-plugin-treeview/
 * http://docs.jquery.com/Plugins/Treeview
 *
 * Copyright (c) 2007 Jörn Zaefferer
 *
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 *
 * Revision: $Id: jquery.treeview.js 4684 2008-02-07 19:08:06Z joern.zaefferer $
 *
 */

;(function($) {

	$.extend($.fn, {
		swapClass: function(c1, c2) {
			var c1Elements = this.filter('.' + c1);
			this.filter('.' + c2).removeClass(c2).addClass(c1);
			c1Elements.removeClass(c1).addClass(c2);
			return this;
		},
		replaceClass: function(c1, c2) {
			return this.filter('.' + c1).removeClass(c1).addClass(c2).end();
		},
		hoverClass: function(className) {
			className = className || "hover";
			return this.hover(function() {
				$(this).addClass(className);
			}, function() {
				$(this).removeClass(className);
			});
		},
		heightToggle: function(animated, callback) {
			animated ?
				this.animate({ height: "toggle" }, animated, callback) :
				this.each(function(){
					jQuery(this)[ jQuery(this).is(":hidden") ? "show" : "hide" ]();
					if(callback)
						callback.apply(this, arguments);
				});
		},
		heightHide: function(animated, callback) {
			if (animated) {
				this.animate({ height: "hide" }, animated, callback);
			} else {
				this.hide();
				if (callback)
					this.each(callback);				
			}
		},
		prepareBranches: function(settings) {
			if (!settings.prerendered) {
				// mark last tree items
				this.filter(":last-child:not(ul)").addClass(CLASSES.last);
				// collapse whole tree, or only those marked as closed, anyway except those marked as open
				this.filter((settings.collapsed ? "" : "." + CLASSES.closed) + ":not(." + CLASSES.open + ")").find(">ul").hide();
			}
			// return all items with sublists
			return this.filter(":has(>ul)");
		},
		applyClasses: function(settings, toggler) {
			this.filter(":has(>ul):not(:has(>a))").find(">span").click(function(event) {
				toggler.apply($(this).next());
			}).add( $("a", this) ).hoverClass();
			
			if (!settings.prerendered) {
				// handle closed ones first
				this.filter(":has(>ul.hiddenTree)")
						.addClass(CLASSES.expandable)
						.replaceClass(CLASSES.last, CLASSES.lastExpandable);
						
				// handle open ones
				this.not(":has(>ul.hiddenTree)")
						.addClass(CLASSES.collapsable)
						.replaceClass(CLASSES.last, CLASSES.lastCollapsable);
						
	            // create hitarea
				this.prepend("<div class=\"" + CLASSES.hitarea + "\"/>").find("div." + CLASSES.hitarea).each(function() {
					var classes = "";
					$.each($(this).parent().attr("class").split(" "), function() {
						classes += this + "-hitarea ";
					});
					$(this).addClass( classes );
				});
			}
			
			// apply event to hitarea
			this.find("div." + CLASSES.hitarea).click( toggler );
		},
		treeview: function(settings) {
			
			settings = $.extend({
				cookieId: "treeview"
			}, settings);
			
			if (settings.add) {
				return this.trigger("add", [settings.add]);
			}
			
			if ( settings.toggle ) {
				var callback = settings.toggle;
				settings.toggle = function() {
					return callback.apply($(this).parent()[0], arguments);
				};
			}
		
			// factory for treecontroller
			function treeController(tree, control) {
				// factory for click handlers
				function handler(filter) {
					return function() {
						// reuse toggle event handler, applying the elements to toggle
						// start searching for all hitareas
						toggler.apply( $("div." + CLASSES.hitarea, tree).filter(function() {
							// for plain toggle, no filter is provided, otherwise we need to check the parent element
							return filter ? $(this).parent("." + filter).length : true;
						}) );
						return false;
					};
				}
				// click on first element to collapse tree
				$("a:eq(0)", control).click( handler(CLASSES.collapsable) );
				// click on second to expand tree
				$("a:eq(1)", control).click( handler(CLASSES.expandable) );
				// click on third to toggle tree
				$("a:eq(2)", control).click( handler() ); 
			}
		
			// handle toggle event
			function toggler() {
				$(this)
					.parent()
					// swap classes for hitarea
					.find(">.hitarea")
						.swapClass( CLASSES.collapsableHitarea, CLASSES.expandableHitarea )
						.swapClass( CLASSES.lastCollapsableHitarea, CLASSES.lastExpandableHitarea )
					.end()
					// swap classes for parent li
					.swapClass( CLASSES.collapsable, CLASSES.expandable )
					.swapClass( CLASSES.lastCollapsable, CLASSES.lastExpandable )
					// find child lists
					.find( ">ul" )
					// toggle them
					.heightToggle( settings.animated, settings.toggle );
				if ( settings.unique ) {
					$(this).parent()
						.siblings()
						// swap classes for hitarea
						.find(">.hitarea")
							.replaceClass( CLASSES.collapsableHitarea, CLASSES.expandableHitarea )
							.replaceClass( CLASSES.lastCollapsableHitarea, CLASSES.lastExpandableHitarea )
						.end()
						.replaceClass( CLASSES.collapsable, CLASSES.expandable )
						.replaceClass( CLASSES.lastCollapsable, CLASSES.lastExpandable )
						.find( ">ul" )
						.heightHide( settings.animated, settings.toggle );
				}
			}
			
			function serialize() {
				function binary(arg) {
					return arg ? 1 : 0;
				}
				var data = [];
				branches.each(function(i, e) {
					data[i] = $(e).is(":has(>ul:visible)") ? 1 : 0;
				});
				$.cookie(settings.cookieId, data.join("") );
			}
			
			function deserialize() {
				var stored = $.cookie(settings.cookieId);
				if ( stored ) {
					var data = stored.split("");
					branches.each(function(i, e) {
						$(e).find(">ul")[ parseInt(data[i]) ? "show" : "hide" ]();
					});
				}
			}
			
			// add treeview class to activate styles
			this.addClass("treeview");
			
			// prepare branches and find all tree items with child lists
			var branches = this.find("li").prepareBranches(settings);
			
			switch(settings.persist) {
			case "cookie":
				var toggleCallback = settings.toggle;
				settings.toggle = function() {
					serialize();
					if (toggleCallback) {
						toggleCallback.apply(this, arguments);
					}
				};
				deserialize();
				break;
			case "location":
				var current = this.find("a").filter(function() { return this.href.toLowerCase() == location.href.toLowerCase(); });
				if ( current.length ) {
					current.addClass("selected").parents("ul, li").add( current.next() ).show();
				}
				break;
			}
			
			branches.applyClasses(settings, toggler);
				
			// if control option is set, create the treecontroller and show it
			if ( settings.control ) {
				treeController(this, settings.control);
				$(settings.control).show();
			}
			
			return this.bind("add", function(event, branches) {
				$(branches).prev()
					.removeClass(CLASSES.last)
					.removeClass(CLASSES.lastCollapsable)
					.removeClass(CLASSES.lastExpandable)
				.find(">.hitarea")
					.removeClass(CLASSES.lastCollapsableHitarea)
					.removeClass(CLASSES.lastExpandableHitarea);
				$(branches).find("li").andSelf().prepareBranches(settings).applyClasses(settings, toggler);
			});
		}
	});
	
	// classes used by the plugin
	// need to be styled via external stylesheet, see first example
	var CLASSES = $.fn.treeview.classes = {
		open: "open",
		closed: "closed",
		expandable: "expandable",
		expandableHitarea: "expandable-hitarea",
		lastExpandableHitarea: "lastExpandable-hitarea",
		collapsable: "collapsable",
		collapsableHitarea: "collapsable-hitarea",
		lastCollapsableHitarea: "lastCollapsable-hitarea",
		lastCollapsable: "lastCollapsable",
		lastExpandable: "lastExpandable",
		last: "last",
		hitarea: "hitarea"
	};
	
	// provide backwards compability
	$.fn.Treeview = $.fn.treeview;
	
})(jQuery);
//Необходимо подключить JS-библиотеки: jquery, jquery-ui, api.js, utilites.js, treeview.js, translations.js, gmxCore.js, 	файл локализации
//						стили: jquery, jquery-ui, search.css, treeview.css, buttons.css

/**
* @namespace Search
* @description Содержит необходимое для поиска
*/
!(function($){

//TODO: переписать генерацию UI на шаблонах

//Очень суровое решение для разруливания конфликтов с глобальными переменными.
var _, _input, _td, _tr, _div, _t, _table, _tbody, _img, _span, _li, _ul, _form;

$('#flash').droppable({
    drop: function(event, ui) {
        var obj = ui.draggable[0].gmxDrawingObject;

        if (obj) {
            var text = Functions.GetFullName(obj.TypeName, obj.ObjName);
            nsGmx.leafletMap.gmxDrawing.addGeoJSON({
                type: 'Feature',
                geometry: L.gmxUtil.geometryToGeoJSON(obj.Geometry),
            }, {text: text});
        }
    }
})

var initTranslations = function() {
    _translationsHash.addtext("rus", {
        "Текущее местоположение отображается только для России и Украины": "Текущее местоположение отображается только для России и Украины",
        "Следующие [value0] страниц": "Следующие [value0] страниц",
        "Следующие [value0] страницы": "Следующие [value0] страницы",
        "Следующая страница": "Следующая страница",
        "Следующая [value0] страница": "Следующая [value0] страница",
        "Предыдущие [value0] страниц" : "Предыдущие [value0] страниц",
        "Первая страница" : "Первая страница",
        "Последняя страница" : "Последняя страница"
    });

    _translationsHash.addtext("eng", {
        "Текущее местоположение отображается только для России и Украины": "Current location is shown only for Russia and Ukraine",
        "Следующие [value0] страниц": "Next [value0] pages",
        "Следующие [value0] страницы": "Next [value0] pages",
        "Следующая страница": "Next page",
        "Следующая [value0] страница": "Next [value0] pages",
        "Предыдущие [value0] страниц" : "Previous [value0] pages",
        "Первая страница" : "First page",
        "Последняя страница" : "Last page"
    });
}


/** Вспомогательные функции
 @namespace Functions
 @memberOf Search
*/
var Functions = {

	/** Возвращает полное наименование объекта, состоящее из типа и наименования
	 @static
	 @param sType Наименование типа объекта
	 @param sName Наименование объекта
    */
	GetFullName: function(/** string */sType, /** string */sName){
		var sFullName = "";

		if (sType==null || sType == "государство" || sType == "г." || /[a-zA-Z]/.test(sName))
			sFullName = sName;
		else if ((sType.indexOf("район") != -1) || (sType.indexOf("область") != -1) || (sType.indexOf("край") != -1))
			sFullName = sName + " " + sType;
		else
			sFullName = sType + " " + sName;

		return sFullName;
	},

	/** Возвращает полный путь к объекту
    * @memberOf Search.Functions
    *
	* @param oFoundObject найденный объект
	* @param sObjectsSeparator разделитель между дочерним элементом и родителем в строке пути
	* @param bParentAfter признак того, что родительский элемент идет после дочернего
	* @param sObjNameField название свойства, из которого брать наименование
    */
	GetPath: function(/*object*/ oFoundObject,/* string */ sObjectsSeparator, /* bool */ bParentAfter, /* string */ sObjNameField){
		if (sObjNameField == null) sObjNameField = "ObjName";
		if (oFoundObject == null) return "";
		var oParentObj = oFoundObject.Parent;
		if (oParentObj != null && (oParentObj.ObjName == "Российская Федерация" || oParentObj.TypeName == "административный округ")) {
			oParentObj = oParentObj.Parent;
		}
		var sObjectName = (oFoundObject.CountryCode != 28000 && oFoundObject.CountryCode != 310000183) ? oFoundObject[sObjNameField] : this.GetFullName(oFoundObject.TypeName, oFoundObject[sObjNameField]);
		if (oParentObj != null && oParentObj[sObjNameField] != null && oParentObj[sObjNameField]){
			if (bParentAfter){
				return sObjectName + sObjectsSeparator + this.GetPath(oParentObj, sObjectsSeparator,  bParentAfter, sObjNameField);
			}
			else{
				return this.GetPath(oParentObj, sObjectsSeparator,  bParentAfter, sObjNameField) + sObjectsSeparator + sObjectName;
			}
		}
		else{
			return sObjectName;
		}
	},

	/** Возвращает строку, соединяющую переданные свойства
	 @static
	 @param oProps - Свойства
	 @param sObjectsSeparator Разделитель 2х свойств в строке*/
	GetPropertiesString: function(/**object[]*/oProps,/**string*/ sPropSeparator, /**object[]*/arrDisplayFields){
		var sResultString = "";
		if (oProps != null){
			for (var sPropName in oProps){
				if (sResultString != "") sResultString += sPropSeparator;
				sResultString += sPropName + ": " + oProps[sPropName];
			}
		}
		return sResultString;
	}
}

/** Конструктор
 @memberOf Search
 @class Контрол, состоящий из поля поиска с подсказками и кнопкой поиска по векторным слоям
 @param oInitContainer Объект, в котором находится контрол (div) - обязательный
 @param params Параметры: <br/>
	<i>layersSearchFlag</i> - {bool} Признак видимости кнопки поиска по векторным слоям <br/>
	<i>Search</i> = function(event, SearchString, layersSearchFlag) -  осуществляет поиск по строке поиска и признаку "Искать по векторным слоям" <br/>
	<i>AutoCompleteSource</i> = function(request, response) - возвращает данные для автозаполнения: [{label:..., category: ...}] <br/>
	<i>AutoCompleteSelect</i> = function(event, oAutoCompleteItem) - вызывается при выборе из строки автозаполнения*/
var SearchInput = function (oInitContainer, params) {
	/**Объект, в котором находится контрол (div)*/
	var Container = oInitContainer;
	/**Признак видимости кнопки поиска по векторным слоям*/
	var layersSearchFlag = params.layersSearchFlag;
	var _this = this;
	if (Container == null) throw "SearchInput.Container is null";
	var _sDefalutAddressVectorLabel = _gtxt("$$search$$_1");
	var _sDefalutAddressLabel = _gtxt("$$search$$_2");
	/** Возвращает содержимое поля поиска
	@function
	@see Search.SearchInput#SetSearchString*/
	this.GetSearchString = function(){return searchField.value};

	/** Устанавливает содержимое поля поиска
	@function
	@see Search.SearchInput#GetSearchString*/
	this.SetSearchString = function(value) {searchField.value = value;};

	/** Устанавливает содержимое поля поиска
	@function
	@see Search.SearchInput#SetSearchStringFocus*/
	this.SetSearchStringFocus = function(flag) {if (flag) searchField.focus(); else searchField.blur();};

	/** Устанавливает подсказку поля поиска
	@function
	@see Search.SearchInput#SetPlaceholder*/
	this.SetPlaceholder = function(value) {
        searchField.value = searchField.placeholder = sDefaultValue = value;
    };

	if (params.Search != null) $(this).bind('Search', params.Search);
	if (params.AutoCompleteSelect != null) $(this).bind('AutoCompleteSelect', params.AutoCompleteSelect)

	var dtLastSearch = new Date();
	/**Текстовое поле для ввода поискового запроса*/
	var searchField = _input(null, [['dir', 'className', 'searchCenter']]);
	var sDefaultValue;

	var divSearchBegin, tdSearchBegin;
	var tdSearchButton = _td([_div(null, [['dir', 'className', 'searchEnd']])], [['dir', 'className', 'searchEndTD']]);

	/**Вызывает событие необходимости начать поиск*/
	var fnSearch = function(){
		/** Вызывается при необходимости начать поиск (обработчик события его осуществляет)
		@name Search.SearchInput.Search
		@event
		@param {string} SearchString строка для поиска
		@param {bool} layersSearchFlag признак необходимости осуществлять поиск по векторным слоям*/
		$(_this).triggerHandler('Search', [searchField.value, layersSearchFlag]);
	}
    tdSearchButton.onclick = fnSearch;

	/** Смена признака необходимости проводить поиск по векторным слоям*/
	var updateSearchType = function() {
		var bChangeValue = (searchField.value == sDefaultValue);

		if (layersSearchFlag) {
			sDefaultValue = _sDefalutAddressVectorLabel;
			divSearchBegin.className = 'searchBeginOn';
		}
		else {
			sDefaultValue = _sDefalutAddressLabel;
			divSearchBegin.className = 'searchBeginOff';
		}

		if (bChangeValue) searchField.value = sDefaultValue;
	}

	if (!layersSearchFlag) {
        sDefaultValue = _sDefalutAddressLabel;
		divSearchBegin = _div(null, [['dir', 'className', 'searchBegin']]);
        tdSearchBegin = _td([divSearchBegin], [['dir', 'className', 'searchBeginTD']]);
    }
    else {
        sDefaultValue = _sDefalutAddressVectorLabel;
		divSearchBegin = _div(null, [['dir', 'className', 'searchBeginOn']]);
		tdSearchBegin = _td([divSearchBegin], [['dir', 'className', 'searchBeginOnTD']]);
        divSearchBegin.onclick = function() {
            layersSearchFlag = !layersSearchFlag;

            updateSearchType(layersSearchFlag);
        }
        attachEffects(divSearchBegin, 'active');
        _title(divSearchBegin, _gtxt('Изменить параметры поиска'));
    }
	searchField.value = sDefaultValue;

    var searchFieldCanvas = _table(	[_tbody([_tr([tdSearchBegin, _td([searchField], [['dir', 'className', 'searchCenterTD']]), tdSearchButton])])],
									[['dir', 'className', 'SearchInputControl']]);

    $(searchField).on('keyup', function(event) {
        if (event.keyCode === 13) {
			if (Number(new Date()) - dtLastSearch < 1000 || $("#ui-active-menuitem").get().length > 0) return; //Если уже ведется поиск по автозаполнению, то обычный не ведем
			dtLastSearch = new Date();
			if($(searchField).data('ui-autocomplete')) {
                $(searchField).autocomplete("close");
            }
            fnSearch();
            return true;
        }
    });

    searchField.onfocus = function() {
        if (this.value == sDefaultValue) {
            this.value = '';

			$(this).addClass('searchCenterValueExists');
        }
    }

    searchField.onblur = function() {
        if (this.value == '') {
            this.value = sDefaultValue;

			$(this).removeClass('searchCenterValueExists');
        }
    }

    _(Container, [searchFieldCanvas]);

	//Добавляем автокомплит только если задана функция источника данных для него
	if (params.AutoCompleteSource != null)
	{

		/** выбор значения из подсказки
		@param {object} event Событие
		@param {object} ui Элемент управления, вызвавший событие*/
		function fnAutoCompleteSelect(event, ui) {
			if (ui.item) {
				dtLastSearch = new Date();
				/** Вызывается при выборе значения из всплывающей подсказки
				@name Search.SearchInput.AutoCompleteSelect
				@event
				@param {object} AutoCompleteItem Выбранное значение*/
				if (ui.item.GeoObject && ui.item.GeoObject.ObjNameShort){
                    ui.item.label = ui.item.GeoObject.ObjNameShort;
                    ui.item.value = ui.item.GeoObject.ObjNameShort;
				}
				$(_this).triggerHandler('AutoCompleteSelect', [ui.item]);
			}
		}

		/** Возвращает данные подсказки
		@param {object} request запрос (request.term - строка запроса)
		@param {object[]} Массив значений для отображения в подсказке*/
		function fnAutoCompleteSource(request, response){
			/** Слова, содержащиеся в строке поиска */
			$(searchField).autocomplete("widget")[0].arrSearchWords = request.term.replace(/[^\wа-яА-Я]+/g, "|").split("|");
			params.AutoCompleteSource(request, function(arrResult){
				if (Number(new Date()) - dtLastSearch > 5000) {
					response(arrResult);
				}
				else
				{
					response([]);
				}
			});
		}

		$(function() {
			$(searchField).autocomplete({
				minLength: 3,
				source: fnAutoCompleteSource,
				select: fnAutoCompleteSelect,
                appendTo: searchField.parentNode
			});

            /** Слова, содержащиеся в строке поиска */
            $(searchField).autocomplete("widget")[0].arrSearchWords = [];

            $(searchField).data("ui-autocomplete")._renderItem = function( ul, item) {
                var t = item.label;
                for (var i=0; i<ul[0].arrSearchWords.length; i++){
                    if(ul[0].arrSearchWords[i].length > 1){
                        var re = new RegExp(ul[0].arrSearchWords[i], 'ig') ;
                        t = t.replace(re, function(str, p1, p2, offset, s){
                            return "<span class='ui-autocomplete-match'>" + str + "</span>";
                        });
                    }
                }
                return $( "<li></li>" )
                    .data( "item.autocomplete", item )
                    .append( "<a>" + t + "</a>" )
                    .appendTo( ul );
            };
		});

	}
	/** Возвращает контрол, в котором находится данный контрол*/
	this.getContainer = function(){return Container;}

	/** Устанавливает значение по умолчанию вместо "Поиск по адресной базе"*/
	this.setAddressVectorDefault = function(value){
		if(searchField.value == _sDefalutAddressLabel) searchField.value = value;
		if(sDefaultValue == _sDefalutAddressLabel) sDefaultValue = value;
		_sDefalutAddressVectorLabel = value;
	}

	/** Устанавливает значение по умолчанию вместо "Поиск по векторным слоям и адресной базе"*/
	this.setAddressDefault = function(value){
		if(searchField.value == _sDefalutAddressLabel) searchField.value = value;
		if(sDefaultValue == _sDefalutAddressLabel) sDefaultValue = value;
		_sDefalutAddressLabel = value;
	}
};

/** Конструктор
 @class Контрол, отображающий результаты поиска в виде списка
 @memberOf Search
 @param {object} oInitContainer Объект, в котором находится контрол (div), обязательный
 @param {string} ImagesHost - строка пути к картинкам*/
var ResultList = function(oInitContainer, ImagesHost){
	/**Объект, в котором находится контрол (div)*/
	var Container = oInitContainer;
	var _this = this;
	var sImagesHost = ImagesHost || "http://maps.kosmosnimki.ru/api/img";

	var arrDisplayedObjects = []; //Объекты, которые отображаются на текущей странице
	var iLimit = 10; //Максимальное количество результатов на странице
	var iPagesCount = 7; //Количество прокручиваемых страниц при нажатии на двойные стрелки
	if (Container == null) throw "ResultList.Container is null";

	var oResultCanvas;
	var arrTotalResultSet = [];

	if(oResultCanvas == null)
	{
		oResultCanvas = _div(null, [['dir', 'className', 'searchResultCanvas']]);
		_(Container, [oResultCanvas]);
	}
	var oLoading = _div([_img(null, [['attr', 'src', sImagesHost + '/progress.gif'], ['dir', 'className', 'searchResultListLoadingImg']]), _t(_gtxt("загрузка..."))], [['dir', 'className', 'searchResultListLoading']]);
	var fnNotFound = function(){_(oResultCanvas, [_div([_t(_gtxt("Поиск не дал результатов"))], [['dir', 'className', 'SearchResultListNotFound']])]);};

	/**Удаляет все найденные объекты из результатов поиска*/
	var unload = function(){
		for(i=0; i<arrDisplayedObjects.length; i++){
			SetDisplayedObjects(i, []);
		}
		$(oResultCanvas).empty();
	}
    /** Переход на следующие страницы*/
    var next = function(iDataSourceN, divChilds, divPages) {
        var button = makeImageButton(sImagesHost + '/next.png', sImagesHost + '/next_a.png');

        button.style.marginBottom = '-7px';

        button.onclick = function() {
			var oDataSource = arrTotalResultSet[iDataSourceN];
            oDataSource.start += iPagesCount;
            oDataSource.reportStart = oDataSource.start * iLimit;

            drawPagesRow(iDataSourceN, divChilds, divPages);
        }

        _title(button, _gtxt('Следующие [value0] страниц', iPagesCount));

        return button;
    }

    /** Переход на предыдущие страницы*/
    var previous = function(iDataSourceN, divChilds, divPages) {
        var button = makeImageButton(sImagesHost + '/prev.png', sImagesHost + '/prev_a.png');

        button.style.marginBottom = '-7px';

        button.onclick = function() {
			var oDataSource = arrTotalResultSet[iDataSourceN];
            oDataSource.start -= iPagesCount;
            oDataSource.reportStart = oDataSource.start * iLimit;

            drawPagesRow(iDataSourceN, divChilds, divPages);
        }

        _title(button, _gtxt('Предыдущие [value0] страниц', iPagesCount));

        return button;
    }

    /** Переход на первую страницу*/
    var first = function(iDataSourceN, divChilds, divPages) {
        var _this = this,
			button = makeImageButton(sImagesHost + '/first.png', sImagesHost + '/first_a.png');

        button.style.marginBottom = '-7px';

        button.onclick = function() {
			var oDataSource = arrTotalResultSet[iDataSourceN];
            oDataSource.start = 0;
            oDataSource.reportStart = oDataSource.start * iLimit;

            drawPagesRow(iDataSourceN, divChilds, divPages);
        }

        _title(button, _gtxt('Первая страница'));

        return button;
    }

    /** Переход на последнюю страницу*/
    var last = function(iDataSourceN, divChilds, divPages) {
        var _this = this,
			button = makeImageButton(sImagesHost + '/last.png', sImagesHost + '/last_a.png');

        button.style.marginBottom = '-7px';

        button.onclick = function() {
			var oDataSource = arrTotalResultSet[iDataSourceN];
            oDataSource.start = Math.floor((oDataSource.SearchResult.length - 1)/ (iPagesCount * iLimit)) * iPagesCount;
            oDataSource.reportStart = Math.floor((oDataSource.SearchResult.length - 1)/ (iLimit)) * iLimit;

            drawPagesRow(iDataSourceN, divChilds, divPages);
        }

        _title(button, _gtxt('Последняя страница'));

        return button;
    }

	/**Добавляет объект в список найденных результатов*/
	var drawObject = function(oFoundObject, elemDiv, bIsParent)
	{
		var	realPath = (oFoundObject.CountryCode != 28000 && oFoundObject.CountryCode != 310000183)  ? oFoundObject.ObjName : Functions.GetFullName(oFoundObject.TypeName, oFoundObject.ObjName);
		if (oFoundObject.Parent != null) realPath += ",";

		var searchElemHeader = _span([_t(realPath)], [['dir', 'className', bIsParent?'searchElemParent':'searchElem']]);

		/** Вызывается при клике на найденный объект в списке результатов поиска
		@name Search.ResultList.onObjectClick
		@event
		@param {object} oFoundObject Найденный объект*/
		searchElemHeader.onclick = function(){$(_this).triggerHandler('onObjectClick', [oFoundObject]);};

		_(elemDiv, [searchElemHeader]);
		if (oFoundObject.Parent != null) drawObject(oFoundObject.Parent, elemDiv, true);
		if (oFoundObject.properties != null) _(elemDiv, [document.createTextNode(" " + Functions.GetPropertiesString(oFoundObject.properties, "; "))]);
	}

	/** Рисует строки списка*/
	var drawRows = function(iDataSourceN, divChilds) {
		var arrObjects = arrDisplayedObjects[iDataSourceN];
		$(divChilds).empty();
		var tbody = _tbody();
		for (var i = 0; i < arrObjects.length; i++) {
			var elemTR = _tr(null, [['dir', 'className', 'SearchResultRow']]);
			var elemTD = _td(null, [['dir', 'className', 'SearchResultText']]);
			_(elemTR, [_td([_t((i+1).toString() + ".")], [['dir', 'className','searchElemPosition']]), elemTD]);
			drawObject(arrObjects[i], elemTD);

			// загрузка SHP Файла
			if (window.gmxGeoCodeShpDownload && arrObjects[i].Geometry != null) {
			    var shpFileLink = _span([_t(".shp")], [['dir', 'className', 'searchElem'], ['attr', 'title', 'скачать SHP-файл'], ['attr', 'number', i]]);

			    shpFileLink.onclick = function () {
			        var obj = arrObjects[$(this).attr('number')];
			        var objsToDownload = [obj];
			        $(_this).triggerHandler('onDownloadSHP', [obj.ObjCode, objsToDownload]);
			    };
			    _(elemTD, [_t(" ")]);
			    _(elemTD, [shpFileLink]);
			}

            elemTD.gmxDrawingObject = arrObjects[i];

            $(elemTD).draggable({
                scroll: false,
                appendTo: document.body,
                helper: 'clone',
                distance: 10
            });

			_(tbody, [elemTR]);
		}
		_(divChilds, [_table([tbody])]);

	}

	/**рисует номера страниц списка
	@param end - последний номер
	@param iDataSourceN - номер источника данных
	@param divChilds - раздел для элементов списка
	@param divPages - раздел для номеров страниц списка*/
	var drawPages = function(end, iDataSourceN, divChilds, divPages) {
		var oDataSource = arrTotalResultSet[iDataSourceN];
		for (var i = oDataSource.start + 1; i <= end; i++) {
			// текущий элемент
			if (i - 1 == oDataSource.reportStart / iLimit) {
				var el = _span([_t(i.toString())]);
				_(divPages, [el]);
				$(el).addClass('page');
			}
			else {
				var link = makeLinkButton(i.toString());

				link.setAttribute('page', i - 1);
				link.style.margin = '0px 2px';

				_(divPages, [link]);

				link.onclick = function() {
					arrTotalResultSet[iDataSourceN].reportStart = this.getAttribute('page') * iLimit;

					drawPagesRow(iDataSourceN, divChilds, divPages);
				};
			}

		}
	}

	/**Рисует одну из страниц списка
	@param iDataSourceN - номер источника данных
	@param divChilds - раздел для элементов списка
	@param divPages - раздел для номеров страниц списка*/
	var drawPagesRow = function(iDataSourceN, divChilds, divPages) {
		var oDataSource = arrTotalResultSet[iDataSourceN];

		// перерисовывем номера страниц
		$(divPages).empty();

		var end = (oDataSource.start + iPagesCount <= oDataSource.allPages) ? oDataSource.start + iPagesCount : oDataSource.allPages;

		if (oDataSource.start - iPagesCount >= 0)
			_(divPages, [first(iDataSourceN, divChilds, divPages), previous(iDataSourceN, divChilds, divPages)]);

		drawPages(end, iDataSourceN, divChilds, divPages);

		if (end + 1 <= oDataSource.allPages)
			_(divPages, [next(iDataSourceN, divChilds, divPages), last(iDataSourceN, divChilds, divPages)]);

		SetDisplayedObjects(iDataSourceN, oDataSource.SearchResult.slice(oDataSource.reportStart, oDataSource.reportStart + iLimit));
		drawRows(iDataSourceN, divChilds);
	}

	/**Рисует таблицу для результатов источника данных
	@param iDataSourceN - номер источника данных
	@param divChilds - раздел для элементов списка
	@param divPages - раздел для номеров страниц списка*/
	var drawTable = function(iDataSourceN, divChilds, divPages) {
		var oDataSource = arrTotalResultSet[iDataSourceN];

		if (oDataSource.SearchResult.length <= iLimit) {
			$(divPages).empty();
			SetDisplayedObjects(iDataSourceN, oDataSource.SearchResult);
			drawRows(iDataSourceN, divChilds);
		}
		else {
			oDataSource.allPages = Math.ceil(oDataSource.SearchResult.length / iLimit);

			drawPagesRow(iDataSourceN, divChilds, divPages);
		}
	}

	/**Обрабатывает событие нажатия на кнопку "Скачать SHP-файл"
	@param iDataSourceN - номер источника данных*/
	var downloadMarkers = function(iDataSourceN) {
		var oDataSource = arrTotalResultSet[iDataSourceN];
		var canvas = _div(),
			filename = _input(null, [['dir', 'className', 'filename'], ['attr', 'value', oDataSource.name]]);

		var downloadButton = makeButton(_gtxt("Скачать"));
		downloadButton.onclick = function() {
			if (filename.value == '') {
				inputError(filename, 2000);

				return;
			}

			/** Вызывается при необходимости осуществить загрузку SHP-файла с результатами поиска
			@name Search.ResultList.onDownloadSHP
			@event
			@param {string} filename Имя файла, которой необходимо будет сформировать
			@param {object[]} SearchResult Результаты поиска, которые необходимо сохранить в файл*/
			$(_this).triggerHandler('onDownloadSHP', [filename.value, oDataSource.SearchResult]);

			$(canvas.parentNode).dialog("destroy").remove();
		}

		_(canvas, [_div([_t(_gtxt("Введите имя файла для скачивания")), filename], [['dir', 'className', 'DownloadSHPButtonText']]), _div([downloadButton], [['dir', 'className', 'DownloadSHPButton']])]);

		var area = getOffsetRect(Container);
		showDialog(_gtxt("Скачать shp-файл"), canvas, 291, 120, 30, area.top + 10);
	}

	/**Отображает результаты поиска с источника данных
	@param iDataSourceN - номер источника данных*/
	var drawSearchResult = function(iDataSourceN) {
		var oDataSource = arrTotalResultSet[iDataSourceN];

		var arrDataSourceList = oDataSource.SearchResult;
		var header = oDataSource.name;

		var divChilds = _div(null, [['dir', 'className', 'SearchResultListChildsCanvas']]),
			divPages = _div(),
			liInner = _li([divChilds, divPages]),
			li;
		if (arrTotalResultSet.length == 1){
			li = _ul([liInner]);
		}
		else{
			li = _li([_div([_t(header), _span([_t("(" + arrDataSourceList.length + ")")])], [['dir', 'className', 'searchLayerHeader']]), _ul([liInner])]);
		}

		oDataSource.start = 0;
		oDataSource.reportStart = 0;
		oDataSource.allPages = 0;

		drawTable(iDataSourceN, divChilds, divPages);

		if (oDataSource.CanDownloadVectors) {
			var downloadVector = makeLinkButton(_gtxt("Скачать shp-файл"));

			downloadVector.onclick = function() {
				downloadMarkers(iDataSourceN);
			}

			liInner.insertBefore(_div([downloadVector], [['dir', 'className', 'SearchDownloadShpLink']]), liInner.firstChild);
		}

		return li;
	}

	/**Отображает результаты поиска в списке
	@param sTotalListName - заголовок итогового результата
	@param {Array.<Object>} arrTotalList. Массив объектов со следующими свойствами{name:DataSourceName, CanDownloadVectors:CanDownloadVectors, SearchResult:arrDataSourceList[oObjFound,...]}
	@returns {void}
	*/
	this.ShowResult = function(sTotalListName, arrTotalList){
		arrTotalResultSet = arrTotalList;
	    $(oResultCanvas).empty();
		arrDisplayedObjects = [];
		if (!objLength(arrTotalResultSet)) {
			fnNotFound();
			return;
		}
		else {
			var foundSomething = false;

			for (var i = 0; i < arrTotalResultSet.length; i++) {
				if (arrTotalResultSet[i].SearchResult.length > 0) {
					foundSomething = true;
					break;
				}
			}
			if (!foundSomething) {
				fnNotFound();
				return;
			}
		}

		var ulSearch = _ul();

		for (var iDataSourceN  = 0; iDataSourceN < arrTotalResultSet.length; iDataSourceN++)
			_(ulSearch, [drawSearchResult(iDataSourceN)]);

		if (arrTotalResultSet.length == 1){
			_(oResultCanvas, [ulSearch]);
		}
		else{
			_(oResultCanvas, [_li([_div([_t(sTotalListName)], [['dir', 'className', 'SearchTotalHeader']]), ulSearch])]);
		}

		$(oResultCanvas).treeview();
		$(oResultCanvas).find(".SearchResultListChildsCanvas").each(function() {
			this.parentNode.style.padding = '0px';
			this.parentNode.style.background = 'none';
		})
	}


    /**Создается переключатель страниц
    @param results - набор результатов
    @param onclick - обработчик нажатия переключателя страниц
    @returns {void}*/
    this.CreatePager = function (results, onclick) {

        function makeNavigButton(pager, img, imga, id, title) {
            var b = makeImageButton(sImagesHost + img, sImagesHost + imga);
            b.style.marginBottom = '-7px';
            $(b).attr('id', id)
            _title(b, title);
            _(pager, [b]);
            return b;
        }

        containerList = Container;
        $('#respager').remove();
        //var pager = _div([_t('всего: ' + results[0].ResultsCount)], [["attr", "id", "respager"]]);
        var pager = _div([_t('')], [["attr", "id", "respager"]]);
        _(containerList, [pager]);

        var pcount = results[0].SearchResult[0] ? Math.ceil(results[0].SearchResult[0].OneOf / iLimit) : 0;
        if (pcount > 1) {
            var first = makeNavigButton(pager, '/first.png', '/first_a.png', 'firstpage', _gtxt('Первая страница'));
            $(first).bind('click', function () {
                fnShowPage(0);
            });
            var prev = makeNavigButton(pager, '/prev.png', '/prev_a.png', 'prevpages', _gtxt('Предыдущие [value0] страниц', iPagesCount));
            $(prev).bind('click', function () {
                fnShowPage(parseInt($('#page1').text()) - iPagesCount - 1);
            });
            $(first).hide();
            $(prev).hide();

            for (var i = 0; i < iPagesCount && i < pcount; ++i) {
                var pagelink = makeLinkButton(i + 1);
                $(pagelink).attr('id', 'page' + (i + 1));
                if (i == 0){
                    $(pagelink).attr('class', 'page')
                    attachEffects(pagelink, '');
                }
                $(pagelink).bind('click', onclick);
                _(pager, [pagelink, _t(' ')]);
            }

            var remains = pcount % iPagesCount;
            var nextPages = pcount/iPagesCount<2 ? remains : iPagesCount
            var nextButTitle = 'Следующие [value0] страниц';
            if (nextPages == 1)
                nextButTitle = 'Следующая страница';
            if (nextPages % 10 == 1 && nextPages != 1 && nextPages != 11)
                nextButTitle = 'Следующая [value0] страница';
            if (1 < nextPages % 10 && nextPages % 10 < 5 && (nextPages<10 || nextPages > 20))
                nextButTitle = 'Следующие [value0] страницы';
            var next = makeNavigButton(pager, '/next.png', '/next_a.png', 'nextpages', _gtxt(nextButTitle, nextPages));
            $(next).bind('click', function () {
                fnShowPage(parseInt($('#page' + iPagesCount).text()));
            });
            var last = makeNavigButton(pager, '/last.png', '/last_a.png', 'lastpage', _gtxt('Последняя страница'));
            $(last).bind('click', function () {
                var lastindex = (remains == 0 ? iPagesCount : remains)
                fnShowPage(pcount - lastindex, $('#page' + lastindex));
            });

            if (iPagesCount >= pcount) {
                $(next).hide();
                $(last).hide();
            }
        }

        var fnShowPage = function (n, active) {
            //alert(n + "\n" + pcount);
            for (var i = 0; i < iPagesCount; ++i) {//pcount
                if (i + n < pcount) {
                    $('#page' + (i + 1)).text(i + n + 1);
                    $('#page' + (i + 1)).show();
                }
                else
                    $('#page' + (i + 1)).hide();
            }

            if (n < iPagesCount) {
                $('#prevpages').hide(); $('#firstpage').hide();
            }
            else {
                $('#prevpages').show(); $('#firstpage').show();
            }

            if (n + iPagesCount < pcount) {
                $('#nextpages').show(); $('#lastpage').show();
                var rest = pcount - n - iPagesCount;
                var nextPages = rest < iPagesCount ? rest : iPagesCount
                var nextButTitle = 'Следующие [value0] страниц';
                if (nextPages == 1)
                    nextButTitle = 'Следующая страница';
                if (nextPages % 10 == 1 && nextPages != 1 && nextPages != 11)
                    nextButTitle = 'Следующая [value0] страница';
                if (1 < nextPages % 10 && nextPages % 10 < 5 && (nextPages < 10 || nextPages > 20))
                    nextButTitle = 'Следующие [value0] страницы';
                $('#nextpages').attr('title', _gtxt(nextButTitle, nextPages));
            }
            else {
                $('#nextpages').hide(); $('#lastpage').hide();
            }

            if (active == null) active = $('#prevpages~span')[0];
            $(active).trigger('click');
        }
    }
    /*----------------------------------------------------------*/

	/**Возвращает список объектов, которые отображаются на текущей странице во всех разделах*/
	this.GetDisplayedObjects = function(){return arrDisplayedObjects; };
	var SetDisplayedObjects = function(iDataSourceN, value) {
		arrDisplayedObjects[iDataSourceN] = value;

		/** Вызывается при изменении отображаемого списка найденных объектов(ведь они отображаются не все)
		@name Search.ResultList.onDisplayedObjectsChanged
		@event
		@param {int} iDataSourceN № источника данных(группы результатов поиска)
		@param {object[]} arrDSDisplayedObjects Результаты поиска, которые необходимо отобразить в текущей группе*/
		$(_this).triggerHandler('onDisplayedObjectsChanged',[iDataSourceN, arrDisplayedObjects[iDataSourceN]]);
	};

	/** Показывает режим загрузки
	@returns {void}*/
	this.ShowLoading = function(){
	    $('#respager').remove();
        $(oResultCanvas).empty();
		_(oResultCanvas, [oLoading]);
	}

	/**Показывает сообщение об ошибке
	@returns {void}*/
	this.ShowError = function(){
		$(oResultCanvas).empty();
		_(oResultCanvas, [_t("Произошла ошибка")]);
	}

	/**Очищает результаты поиска
	@returns {void}*/
	this.Unload = function(){unload();};
	/** Возвращает контрол, в котором находится данный контрол*/
	this.getContainer = function(){return Container;};
};

/** Конструктор
 @class Предоставляет функции, отображающие найденные объекты на карте
 @memberof Search
 @param {L.Map} map карта, на которой будут рисоваться объекты
 @param {string} sInitImagesHost - строка пути к картинкам
 @param {bool} bInitAutoCenter - если true, карта будет центрироваться по 1ому найденному объекту*/
var ResultRenderer = function(map, sInitImagesHost, bInitAutoCenter){
	if (map == null)  throw "ResultRenderer.Map is null";

	var sImagesHost = sInitImagesHost || "http://maps.kosmosnimki.ru/api/img";
	var bAutoCenter = (bInitAutoCenter == null) || bInitAutoCenter;

	var arrContainer = [];
	var counts = [];	
		
	this.eraseMarkers = function(){
			for (var i=0; i<arrContainer.length; ++i)
				if (arrContainer[i]){
					map.removeLayer(arrContainer[i]);
					delete arrContainer[i];
				}
	}

	/** возвращает стили найденных объектов, используется только для точки*/
	var getSearchIcon = function(iPosition) {
        iPosition = Math.min(iPosition, 9);
        return L.icon({
            iconUrl: sImagesHost + "/search/search_" + (iPosition + 1).toString() + ".png",
            iconAnchor: [15, 38],
            popupAnchor: [0, -28]
        });

		// return [
						// { marker: { image: sImagesHost + "/search/search_" + (iPosition + 1).toString() + ".png", dx: -14, dy: -38} },
						// { marker: { image: sImagesHost + "/search/search_" + (iPosition + 1).toString() + "a.png", dx: -14, dy: -38} }
				// ];
	}

    var bindHoverPopup = function(layer, content) {
        layer.bindPopup(content);
    }

	/**Помещает объект на карту
	@param {MapObject} oContainer контейнер, содержащий в себе объекты текущей группы результатов поиска
	@param {MapObject} oFoundObject добавляемый объект
	@param {int} iPosition порядковый номер добавляемого объекта в группе
	@param {int} iCount общее количество объектов в группе
    @return {Object} Нарисованные на карте объекты: хеш с полями center и boundary */
	var DrawObject = function(oContainer, oFoundObject, iPosition, iCount){
        var color = Math.round(0x22 + 0x99*iPosition/iCount);
		var sDescr = "<b>" + Functions.GetFullName(oFoundObject.TypeName, oFoundObject.ObjName) + "</b><br/>" + Functions.GetPath(oFoundObject.Parent, "<br/>", true);
		if (oFoundObject.properties != null) sDescr += "<br/>" + Functions.GetPropertiesString(oFoundObject.properties, "<br/>");

        sDescr = sDescr.replace(/;/g, "<br/>");

		var fnBaloon = function(o) {
			return o.properties.Descr.replace(/;/g, "<br/>");
		};
		var centerMapElem,
            boundaryMapElem;
		//Рисуем центр объекта
		if (oFoundObject.Geometry != null && oFoundObject.Geometry.type == 'POINT') {
            centerMapElem = L.marker([oFoundObject.Geometry.coordinates[1], oFoundObject.Geometry.coordinates[0]], {
                icon: getSearchIcon(iPosition)
            });
            bindHoverPopup(centerMapElem, sDescr);
            oContainer.addLayer(centerMapElem);
		}
		else if (oFoundObject.CntrLon != null && oFoundObject.CntrLat != null){
            centerMapElem = L.marker([oFoundObject.CntrLat, oFoundObject.CntrLon], {
                icon: getSearchIcon(iPosition)
            });

            bindHoverPopup(centerMapElem, sDescr);
            oContainer.addLayer(centerMapElem);
		}


		//Рисуем контур объекта
		if (oFoundObject.Geometry != null && oFoundObject.Geometry.type != 'POINT') {
            boundaryMapElem = L.geoJson(L.gmxUtil.geometryToGeoJSON(oFoundObject.Geometry), {
                style: function(feature) {
                    return
                },
                onEachFeature: function(feature, layer) {
                    layer.setStyle({
                        color: '#' + (0x1000000 + (color << 16) + (color << 8) + color).toString(16).substr(-6),
                        weight: 3,
                        opacity: 0.6,
                        fill: false
                    });

                    bindHoverPopup(layer, sDescr)
                }
            });

            oContainer.addLayer(boundaryMapElem);
		}

        return {center: centerMapElem, boundary: boundaryMapElem};
	};

	/**Центрует карту по переданному объекту*/
	var CenterObject = function(oFoundObject){
		if (!oFoundObject) return;
		var iZoom = oFoundObject.TypeName == "г." ? 9 : 15;
        if (oFoundObject.Geometry == null) {
		    if (oFoundObject.MinLon != null && oFoundObject.MaxLon != null && oFoundObject.MinLat != null && oFoundObject.MaxLat != null
                && oFoundObject.MaxLon - oFoundObject.MinLon < 1e-9 && oFoundObject.MaxLat - oFoundObject.MinLat < 1e-9)
			    map.setView([oFoundObject.CntrLat, oFoundObject.CntrLon], iZoom);
		    else
			    map.fitBounds([[oFoundObject.MinLat, oFoundObject.MinLon], [oFoundObject.MaxLat, oFoundObject.MaxLon]]);
        }
		else
		{
           if (oFoundObject.Geometry.type == 'POINT') {
		        if (oFoundObject.MinLon != oFoundObject.MaxLon && oFoundObject.MinLat != oFoundObject.MaxLat) {
			        map.fitBounds([[oFoundObject.MinLat, oFoundObject.MinLon], [oFoundObject.MaxLat, oFoundObject.MaxLon]]);
                } else {
                    var c = oFoundObject.Geometry.coordinates;
			        map.setView([c[1], c[0]], iZoom);
                }
		    }
		    else {
                var bounds = L.gmxUtil.getGeometryBounds(oFoundObject.Geometry);
			    //var oExtent = getBounds(oFoundObject.Geometry.coordinates);
			    map.fitBounds([[bounds.min.y, bounds.min.x], [bounds.max.y, bounds.max.x]]);
            }
		}
	};

	/**Центрует карту по переданному объекту
	@param {MapObject} oFoundObject объект, который нужно поместить в центр
	@returns {void}*/
	this.CenterObject = function(oFoundObject){
		CenterObject(oFoundObject);
	}

	/** Рисует объекты на карте.
	@param {int} iDataSourceN № источника данных (группы результатов поиска)
	@param {Array} arrFoundObjects Массив объектов для отрисовки. Каждый объект имеет свойства 
	@param {bool} [options.append=false] Добавить к существующим объектам для источника данных, а не удалять их
	@return {Array} Нарисованные на карте объекты: массив хешей с полями center и boundary
    */
	this.DrawObjects = function(iDataSourceN, arrFoundObjects, options){
        options = $.extend({append: false}, options);

        if (!options.append && arrContainer[iDataSourceN]) {
            map.removeLayer(arrContainer[iDataSourceN]);
            delete arrContainer[iDataSourceN];
        }

        if (!arrContainer[iDataSourceN]) {
            arrContainer[iDataSourceN] = L.layerGroup();
            counts[iDataSourceN] = 0;
        }

		iCount = arrFoundObjects.length;

        var mapObjects = [];

        counts[iDataSourceN] += arrFoundObjects.length;

		//Отрисовываем задом наперед, чтобы номер 1 был сверху от 10ого
		for (var i = arrFoundObjects.length - 1; i >= 0; i--){
			mapObjects.unshift(DrawObject(arrContainer[iDataSourceN], arrFoundObjects[i], counts[iDataSourceN] + i - arrFoundObjects.length, counts[iDataSourceN]));
		}

		arrContainer[iDataSourceN].addTo(map);
		if (bAutoCenter && iDataSourceN == 0) CenterObject(arrFoundObjects[0]);

        return mapObjects;
	}
};

/** Конструктор
 @class Предоставляет функции, отображающие найденные объекты на карте
 @memberof Search
 @param {object} oInitMap карта, на которой будут рисоваться объекты
 @param {function} fnSearchLocation = function({Geometry, callback})- функция поиска объектов по переданной геометрии*/
var LocationTitleRenderer = function(oInitMap, fnSearchLocation){
	var _this = this;
	var oMap = oInitMap;
	var dtLastSearch;

	/**Добавляет объект в список найденных результатов*/
	var drawObject = function(oFoundObject, elemDiv)
	{
		if (oFoundObject.Parent != null) drawObject(oFoundObject.Parent, elemDiv, true);
		var	realPath = oFoundObject.IsForeign ? oFoundObject.ObjName : Functions.GetFullName(oFoundObject.TypeName, oFoundObject.ObjName);

		var searchElemHeader = _span([_t(realPath)], [['dir', 'className', 'searchLocationPath']]);

		/** Вызывается при клике на найденный объект в списке результатов поиска
		@name Search.ResultList.onObjectClick
		@event
		@param {object} oFoundObject Найденный объект*/
		searchElemHeader.onclick = function(){$(_this).triggerHandler('onObjectClick', [oFoundObject]);};

		if (oFoundObject.Parent != null) _(elemDiv, [_t("->")]);
		_(elemDiv, [searchElemHeader]);
	}

	var setLocationTitleDiv = function(div, attr) {
		if (dtLastSearch && Number(new Date()) - dtLastSearch < 300) return;
		dtLastSearch = new Date();

		var locationTitleDiv = div;

		fnSearchLocation({Geometry: attr['screenGeometry'], callback: function(arrResultDataSources){
			$(locationTitleDiv).empty();
			if(arrResultDataSources.length>0 && arrResultDataSources[0].SearchResult.length>0){
				drawObject(arrResultDataSources[0].SearchResult[0], locationTitleDiv);
			}
			else{
				_(locationTitleDiv, [_t(_gtxt("Текущее местоположение отображается только для России и Украины"))]);
			}
		}});
	};

	if (oMap.coordinates) oMap.coordinates.addCoordinatesFormat(setLocationTitleDiv);
}

/** Возвращает контрол, отображающий результаты поиска в виде списка с нанесением на карту 
 @memberof Search
 @param {object} oInitContainer Объект, в котором находится контрол результатов поиска в виде списка(div)
 @param {object} oInitMap карта, на которой будут рисоваться объекты
 @param {string} ImagesHost - строка пути к картинкам
 @param {bool} bInitAutoCenter - если true, карта будет центрироваться по 1ому найденному объекту
 @returns {Search.ResultListMap}*/
var ResultListMapGet = function(oInitContainer, oInitMap, sImagesHost, bInitAutoCenter){
	var oRenderer = new ResultRenderer(oInitMap, sImagesHost, bInitAutoCenter);
	var lstResult = new ResultList(oInitContainer, sImagesHost);
	ResultListMap.call(this, lstResult, oRenderer);
	
	this.eraseMarkers = function(){	
		oRenderer.eraseMarkers();
	}
}

ResultListMapGet.prototype = ResultListMap;

/** Конструктор
 @class Контрол, отображающий результаты поиска в виде списка с нанесением на карту
 @memberof Search
 @param lstResult Контрол результатов поиска в виде списка
 @param oRenderer Объект, предоставляющий функции отрисовки найденных объектов на карте*/
var ResultListMap = function(lstResult, oRenderer){
	var _this = this;

	var fnDisplayedObjectsChanged = function(event, iDataSourceN, arrFoundObjects){
		oRenderer.DrawObjects(iDataSourceN, arrFoundObjects);
		/** Вызывается при изменении отображаемого списка найденных объектов(ведь они отображаются не все)
		@name Search.ResultListMap.onDisplayedObjectsChanged
		@event
		@param {int} iDataSourceN № источника данных(группы результатов поиска)
		@param {object[]} arrDSDisplayedObjects Результаты поиска, которые необходимо отобразить в текущей группе*/
		$(_this).triggerHandler('onDisplayedObjectsChanged', [iDataSourceN, arrFoundObjects]);
	}

	var fnObjectClick = function(event, oFoundObject){
		oRenderer.CenterObject(oFoundObject);

		/** Вызывается при клике на найденный объект в списке результатов поиска
		@name Search.ResultListMap.onObjectClick
		@event
		@param {object} oFoundObject Найденный объект*/
		$(_this).triggerHandler('onObjectClick', [oFoundObject]);
	}

	var fnDownloadSHP = function(event, filename, arrObjectsToDownload){
		/** Вызывается при необходимости осуществить загрузку SHP-файла с результатами поиска
		@name Search.ResultListMap.onDownloadSHP
		@event
		@param {string} filename Имя файла, которой необходимо будет сформировать
		@param {object[]} SearchResult Результаты поиска, которые необходимо сохранить в файл*/
		$(_this).triggerHandler('onDownloadSHP', [filename, arrObjectsToDownload]);
	}

	$(lstResult).bind('onDisplayedObjectsChanged', fnDisplayedObjectsChanged);
	$(lstResult).bind('onObjectClick', fnObjectClick);
	$(lstResult).bind('onDownloadSHP', fnDownloadSHP);

	/**Отображает результаты поиска в списке
	@param sTotalListName - заголовок итогового результата
	@param {Array.<Object>} arrTotalList Массив объектов со следующими свойствами {name:DataSourceName, CanDownloadVectors:CanDownloadVectors, SearchResult:arrDataSourceList[oObjFound,...]}
	@returns {void}*/
	this.ShowResult = function(sTotalListName, arrTotalList){
		lstResult.ShowResult(sTotalListName, arrTotalList);
	}


    /**Создается переключатель страниц
    @param results - набор результатов
    @param onclick - обработчик нажатия переключателя страниц
    @returns {void}*/
    this.CreatePager = function (results, onclick) {
        lstResult.CreatePager(results, onclick);
    }

	/**Показывает режим загрузки
	@returns {void}*/
	this.ShowLoading = function(){
		lstResult.ShowLoading();
	}

	/**Показывает сообщение об ошибке
	@returns {void}*/
	this.ShowError = function(){
		lstResult.ShowError();
	}

	/**Центрует карту по переданному объекту
	@param {MapObject} oFoundObject объект, который нужно поместить в центр
	@returns {void}*/
	this.CenterObject = function(oFoundObject){
		oRenderer.CenterObject(oFoundObject);
	}

	/**Очищает результаты поиска
	@returns {void}*/
	this.Unload = function(){lstResult.Unload();};
	/** Возвращает контейнер, содержащий список найденных объектов*/
	this.getContainerList = function(){return lstResult.getContainer();};
}

/**Конструктор
 @class SearchDataProvider Посылает запрос к поисковому серверу
 @memberof Search
 @param {string} sInitServerBase Адрес сервера, на котором установлен поисковый модуль Geomixer'а
 @param {L.gmxMap} gmxMap карта, содержащая слои, по которым должен производиться поиск
 @param {string[]} arrDisplayFields список атрибутов векторных слоев, которые будут отображаться в результатах поиска*/
var SearchDataProvider = function(sInitServerBase, gmxMap, arrDisplayFields){
	var sServerBase = sInitServerBase;
	if (sServerBase == null || sServerBase.length < 7) {throw "Error in SearchDataProvider: sServerBase is not supplied"};
	// var oMap = oInitMap;
	var iDefaultLimit = 100;
	var _this = this;
	/**Осуществляет поиск по произвольным параметрам
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
		<i>Limit</i> - максимальное число найденных объектов
		<i>WithoutGeometry<i> - не передавать геометрию в результатах поиска
		<i>RequestType<i> - Тип запроса к серверу
        <i>PageNum<i> - Показать страницу
        <i>ShowTotal<i> - Сообщить сколько найдено всего записей
        <i>UseOSM<i> - Искать в базе OSM
	@returns {void}*/
	var fnSearch = function(params)	{
		var callback = params.callback;
		var sQueryString = "RequestType=" + encodeURIComponent(params.RequestType);
		if (params.SearchString != null) sQueryString += "&SearchString=" + encodeURIComponent(params.SearchString);
		if (params.Geometry != null) sQueryString += "&GeometryJSON=" + encodeURIComponent(JSON.stringify(params.Geometry));
		if (params.Limit != null) sQueryString += "&Limit=" + encodeURIComponent(params.Limit.toString());
		if (params.ID != null) sQueryString += "&ID=" + encodeURIComponent(params.ID.toString());
		if (params.TypeCode != null) sQueryString += "&TypeCode=" + encodeURIComponent(params.TypeCode.toString());
		if (params.IsStrongSearch != null) sQueryString += "&IsStrongSearch=" + encodeURIComponent(params.IsStrongSearch ? "1" : "0");
		if (params.WithoutGeometry != null) sQueryString += "&WithoutGeometry=" + encodeURIComponent(params.WithoutGeometry ? "1" : "0");
		if (params.PageNum != null) sQueryString += "&PageNum=" + params.PageNum;
		if (params.ShowTotal != null) sQueryString += "&ShowTotal=" + params.ShowTotal;
		if (params.UseOSM != null) sQueryString += "&UseOSM=" + params.UseOSM;
		//if (sFormatName != null) sQueryString += "&Format=" + encodeURIComponent(sFormatName);

		var key = window.KOSMOSNIMKI_SESSION_KEY;
		if (key == null || key == "INVALID")
			key = false;
		sendCrossDomainJSONRequest(sServerBase + "SearchObject/SearchAddress.ashx?" + sQueryString + (key ? ("&key=" + encodeURIComponent(key)) : ""), function (response) {
			if (response.Status == 'ok') {callback(response.Result);}
			else {throw response.ErrorInfo.ErrorMessage;}
		});
	};

	/**Осуществляет поиск по переданной строке
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Limit</i> - максимальное число найденных объектов
		<i>WithoutGeometry<i> - не передавать геометрию в результатах поиска
        <i>PageNum<i> - Показать страницу
        <i>ShowTotal<i> - Сообщить сколько найдено всего записей
        <i>UseOSM<i> - Искать в базе OSM
	@returns {void}*/
	this.SearchByString = function(params){
	    fnSearch({ callback: params.callback, SearchString: params.SearchString, IsStrongSearch: params.IsStrongSearch, Limit: params.Limit, WithoutGeometry: params.WithoutGeometry, RequestType: "SearchObject",
        PageNum: params.PageNum, ShowTotal: params.ShowTotal, UseOSM: params.UseOSM });
	};

	/**Получает информацию об объекте
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>ID</i> - идентификатор объекта </br>
	@returns {void}*/
	this.SearchID = function(params){
		fnSearch({callback: params.callback, ID: params.ID, RequestType: "ID", TypeCode: params.TypeCode, UseOSM: params.UseOSM});
	}

	/**Осуществляет поиск текущего местонахождения
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
	@returns {void}*/
	this.SearchLocation = function(params){
		fnSearch({callback: params.callback, Geometry: params.Geometry, WithoutGeometry: true, RequestType: "Location"});
	}

    /**Осуществляет поиск ближайшего объекта к центру указанной области
    @param {object} params Параметры: </br>
    <i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
    <i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
    @returns {void}*/
    this.SearchNearest = function (params) {
        fnSearch({ callback: params.callback, Geometry: params.Geometry, WithoutGeometry: true, RequestType: "Nearest" });
    }

	/**Осуществляет поиск по произвольным параметрам
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
		<i>Limit</i> - максимальное число найденных объектов
		<i>WithoutGeometry<i> - не передавать геометрию в результатах поиска
	@returns {void}*/
	this.Search = function(params){
		fnSearch({
			callback: params.callback,
			SearchString: params.SearchString,
			IsStrongSearch: params.IsStrongSearch,
			Limit: params.Limit == null ? iDefaultLimit : params.Limit,
			Geometry: params.Geometry,
			WithoutGeometry: params.WithoutGeometry,
			RequestType: "SearchObject"
		});
	};

	/**Осуществляет поиск по векторным слоям
	@returns {void}*/
	this.LayerSearch = function(sInitSearchString, oInitGeometry, callback){
		if (!gmxMap){
			callback([]);
			return;
		}
		var arrResult = [];

		var layersToSearch = [];
		for (var i=0; i< gmxMap.layers.length; i++) {
            //свойства мы берём из дерева слоёв, а не из API. Cвойство AllowSearch относится к карте и не поддерживаются API
            var searchRes = _layersTree.treeModel.findElem('name', gmxMap.layers[i].getGmxProperties().name);

            if (searchRes) {
                var props = searchRes.elem.content.properties;
                
                if (props.type == "Vector" && props.AllowSearch && gmxMap.layers[i]._map) {
                    layersToSearch.push(props);
                }
            }
        }
		var iRespCount = 0;

		if (layersToSearch.length > 0){
            layersToSearch.forEach(function(props) {
                var mapName = gmxMap.layersByID[props.name].options.mapID;
                var url = "http://" + props.hostName + "/SearchObject/SearchVector.ashx" +
                    "?LayerNames=" + props.name +
                    "&MapName=" + mapName +
                    (sInitSearchString ? ("&SearchString=" + encodeURIComponent(sInitSearchString)) : "") +
                    (oInitGeometry ? ("&border=" + encodeURIComponent(JSON.stringify(L.gmxUtil.convertGeometry(oInitGeometry)))) : "");
                sendCrossDomainJSONRequest(
                    url,
                    function(searchReq)
                    {
                        iRespCount++;
                        var arrLayerResult = [];
                        if (searchReq.Status == 'ok')
                        {
                            for (var iServer = 0; iServer < searchReq.Result.length; iServer++)
                            {
                                var limitSearchResults = typeof(LayerSearchLimit)=="number" ? LayerSearchLimit : 100;
                                var req = searchReq.Result[iServer];
                                for (var j = 0; j<limitSearchResults && j < req.SearchResult.length; j++)
                                {
                                    var arrDisplayProperties = {};
                                    if (!arrDisplayFields) {
                                        arrDisplayProperties = req.SearchResult[j].properties;
                                    }
                                    else {
                                        for (var iProperty=0; iProperty<arrDisplayFields.length; iProperty++){
                                            var sPropName = arrDisplayFields[iProperty];
                                            if(sPropName in req.SearchResult[j].properties) {
                                                arrDisplayProperties[sPropName] = req.SearchResult[j].properties[sPropName];
                                            }
                                        }
                                    }

                                    for (var p in arrDisplayProperties) {
                                        var type = props.attrTypes[props.attributes.indexOf(p)];
                                        arrDisplayProperties[p] = nsGmx.Utils.convertFromServer(type, arrDisplayProperties[p]);
                                    }

                                    arrLayerResult.push({
                                        ObjName: req.SearchResult[j].properties.NAME || req.SearchResult[j].properties.Name || req.SearchResult[j].properties.name || req.SearchResult[j].properties.text || req.SearchResult[j].properties["Название"] || "[объект]",
                                        properties: arrDisplayProperties, 
                                        Geometry: L.gmxUtil.convertGeometry(req.SearchResult[j].geometry, true)
                                    });
                                }
                            }
                        }
                        if(arrLayerResult.length > 0) arrResult.push({name: props.title, SearchResult: arrLayerResult, CanDownloadVectors: true});

                        if (iRespCount == layersToSearch.length){
                            callback(arrResult);
                            return;
                        }
                    }
                );
            })
		}
		else{
			callback(arrResult);
		}
	}

	/**Возвращает адрес сервера, на котором установлен поисковый модуль Geomixer'а*/
	this.GetServerBase = function(){
		return sServerBase;
	}
}

/** Cинхронное последовательное обращение к наблюдателям 
    @param queue {Array} очередь наблюдателей    
*/   
var deferredsChain = function(queue, params){
    var deferred = $.Deferred(),
    promise = $.when(deferred);
    if(queue.length>0){
        queue[0](1, deferred, params);
        for (var i=1; i<queue.length; ++i) {
            promise = promise.then(function(current) {
                if (current<0) return current;
                var d = $.Deferred();
                queue[current](current+1, d, params);
                return d;
            });
        }
    }
    else{
        deferred.resolve(0);  
    }
    return promise;  
}	

/**Возращает класс, который предоставляет функции обработки найденных данных
 @memberof Search
 @param {string} ServerBase Адрес сервера, на котором установлен поисковый модуль Geomixer'а
 @param {L.gmxMap} gmxMap карта с векторными слоями для поиска
 @param {bool} WithoutGeometry - по умолчанию не передавать геометрию в результатах поиска
 @param {object} [params] дополнительные параметры
 @param {object} [params.UseOSM] использовать ли геокодер OSM
 @returns {Search.SearchLogic}*/
var SearchLogicGet = function(ServerBase, gmxMap, WithoutGeometry, params){
    SearchLogic.call(this, new SearchDataProvider(ServerBase, gmxMap), WithoutGeometry, params);
}

SearchLogicGet.prototype = SearchLogic;

/**Конструктор
 @class Предоставляет функции обработки найденных данных
 @memberof Search
 @param {object} oInitSearchDataProvider источник данных для обработки
 @param {bool} WithoutGeometry - по умолчанию не передавать геометрию в результатах поиска
 @param {Object} [params] - дополнительные параметры
 @param {Object} [params.UseOSM] - Искать ли в базе OSM
*/
var SearchLogic = function(oInitSearchDataProvider, WithoutGeometry, params){
    var oSearchDataProvider = oInitSearchDataProvider;
    var iLimitAutoComplete = typeof (AutoCompleteLimit) == "number" ? AutoCompleteLimit : 10; //Максимальное количество результатов
	var _this = this;
	if(oSearchDataProvider == null) throw "Error in SearchLogic: oSearchDataProvider is not supplied";

    var useOSMDefault = 0;
    if (params && 'UseOSM' in params) {
        useOSMDefault = Number(params.UseOSM);
    } else  if (typeof gmxGeoCodeUseOSM !== 'undefined') {
        useOSMDefault = Number(gmxGeoCodeUseOSM);
    }

	/** Возращает полный путь к объекту для отображения в подсказке
	@param oFoundObject Найденный объект
	@param sObjNameField название свойства, из которого брать наименование
	@param sObjNameField название свойства, из которого брать наименование родительского объекта
	*/
	var fnGetLabel = function(oFoundObject, sObjNameField, sObjNameFieldParent){
		var sLabel = Functions.GetFullName(oFoundObject.TypeName, oFoundObject[sObjNameField]);
		if (oFoundObject.Parent != null) sLabel += ", " + Functions.GetPath(oFoundObject.Parent, ", ", true, sObjNameFieldParent);
		if (oFoundObject.Parent == null && oFoundObject.Path != null) {
		    for (var i = oFoundObject.Path.length-2; i >=0; --i)
		        sLabel += (i<oFoundObject.Path.length-1?", ":"") + Functions.GetFullName(oFoundObject.Path[i][0], oFoundObject.Path[i][1])
        }
		return sLabel;
	}


    /** Очередь наблюдателей за началом поиска    
    */
    var SearchStarting = [];

    /** Событие в начале обработки поискового запроса (перед обращением к геокдеру)
        @param {{add:bool, remove:bool, observer:function(next, deferred, params)}} 
        observer возвращает $.Deferred() для асинхронной последовательной обработки, $.Deferred().resolve(next) 
        для перехода к очередному наблюдателю или $.Deferred().resolve(-1) для остановки всей обработки
    */
    this.SearchStarting = function(params){
		if (params){
			for (var i = 0; i < SearchStarting.length; i++)
				if(SearchStarting[i] === params.observer)
					if(params.remove){
						//console.log("remove observer");
						SearchStarting.splice(i, 1);
					}
					else
						return;        
			if(params.add){
				//console.log("add observer");
				SearchStarting.push(params.observer);
			}
		}
		else
			return SearchStarting;
    }
	
    /** Очередь наблюдателей за началом обработки запроса для подсказки     
    */
    var AutoCompleteDataSearchStarting = [];

    /** Событие в начале обработки запроса для подсказки  (перед обращением к геокдеру)
        @param {{add:bool, remove:bool, observer:function(next, deferred, params)}}
        observer возвращает $.Deferred() для асинхронной последовательной обработки, $.Deferred().resolve(next)
        для перехода к очередному наблюдателю или $.Deferred().resolve(-1) для остановки всей обработки
    */
    this.AutoCompleteDataSearchStarting = function(params){
        for (var i = 0; i < AutoCompleteDataSearchStarting.length; i++)
            if(AutoCompleteDataSearchStarting[i] === params.observer)
                if(params.remove){
                    //console.log("remove observer");
                    AutoCompleteDataSearchStarting.splice(i, 1);
                }
                else
                    return;
        if(params.add){
            //console.log("add observer");
            AutoCompleteDataSearchStarting.push(params.observer);
        }
    }

	/**Возращает сгуппированные данные для отображения подсказок поиска в функции callback
	    @param {String} SearchString строка, по которой надо выдать подсказку
	    @param {function(arrResult)} callback вызывается когда подсказка готова
    */
	this.AutoCompleteData = function (SearchString, callback){
            deferredsChain(AutoCompleteDataSearchStarting, {searchString:SearchString, callback:callback}).done(function(fin){
            //console.log('finally ' + fin);
            if (fin!=-1)
	            _this.SearchByString({
                    SearchString: SearchString,
                    IsStrongSearch: 0,
                    Limit: iLimitAutoComplete,
                    WithoutGeometry: 1,
	                UseOSM: useOSMDefault,
                callback: function(arrResultDataSources){
			        var arrResult = [];
			        var sSearchRegExp = new RegExp("("+SearchString.replace(/^\s|\s$/, "").replace(/[^\wа-яА-Я]+/g, "|")+")", "i");
			        for(var iDS=0; iDS<arrResultDataSources.length; iDS++){
				        for(var iFoundObject=0; iFoundObject<arrResultDataSources[iDS].SearchResult.length; iFoundObject++){
					        var oFoundObject = arrResultDataSources[iDS].SearchResult[iFoundObject];
					        var sLabel = fnGetLabel(oFoundObject, "ObjName", "ObjName"), sValue = Functions.GetFullName(oFoundObject.TypeName, oFoundObject.ObjName);
					        if(/[a-zA-Z]/.test(SearchString)){
                                if(oFoundObject.ObjAltNameEng || oFoundObject.ObjNameEng){
						            if(oFoundObject.ObjAltNameEng && oFoundObject.ObjAltNameEng.match(sSearchRegExp)){
							            sLabel = fnGetLabel(oFoundObject, "ObjAltNameEng", "ObjNameEng");
							            sValue = sLabel;
							            //if (oFoundObject.ObjAltName && !/[a-zA-Z]/.test(oFoundObject.ObjName)) sLabel += ' | ' + fnGetLabel(oFoundObject, "ObjAltName", "ObjName");
						            }
						            else{
							            sLabel = fnGetLabel(oFoundObject, "ObjNameEng", "ObjNameEng");
							            sValue = sLabel;
							            //if (oFoundObject.ObjName && !/[a-zA-Z]/.test(oFoundObject.ObjName)) sLabel += ' | ' + fnGetLabel(oFoundObject, "ObjName", "ObjName");
						            }
						        }
					        }
					        else{
						        if(oFoundObject.ObjAltName && oFoundObject.ObjAltName.match(sSearchRegExp)){
							        sLabel = fnGetLabel(oFoundObject, "ObjAltName", "ObjName");
							        sValue = sLabel;
							        //if (oFoundObject.ObjAltNameEng) sLabel += ' | ' + fnGetLabel(oFoundObject, "ObjAltNameEng", "ObjNameEng");
						        }
						        else{
							        sLabel = fnGetLabel(oFoundObject, "ObjName", "ObjName");
							        sValue = sLabel;
							        //if (oFoundObject.ObjNameEng) sLabel += ' | ' + fnGetLabel(oFoundObject, "ObjNameEng", "ObjNameEng");
						        }
					        }
					        arrResult.push({
						        label: sLabel,
						        value: sValue,
						        GeoObject: oFoundObject});
				        }
				        if(arrResult.length>0) break;
			        }
			        callback(arrResult);
		        }
            });
        });
	}

	/** Группирует по категории
	@param {Array} arrInitDataSources Массив ответов от поисковых серверов
	@returns {Array} Массив сгруппированых по категориям данных*/
	this.GroupByCategory = function(arrInitDataSources)	{
		var arrResultDataSources = [];
		for(var i=0; i<arrInitDataSources.length; i++){
			arrResultDataSources[i] = {	name: arrInitDataSources[i].name,
										CanDownloadVectors: arrInitDataSources[i].CanDownloadVectors,
										SearchResult: []};
			var oDataSource = arrInitDataSources[i].SearchResult;
			var Categories = arrResultDataSources[i].SearchResult;
			var CategoriesIndex = {};
			for(var j=0; j<oDataSource.length; j++){
				var sCategory = "";
				var sCategoryDesc = "";
				var iPriority = 9999999;
				var iCatID = 0;
				if(oDataSource[j].Parent != null)
				{
					iCatID = oDataSource[j].Parent.ObjCode;
					sCategory = Functions.GetPath(oDataSource[j].Parent, ", ", false);
					sCategoryDesc = Functions.GetPath(oDataSource[j].Parent, ", ", true);
					iPriority = oDataSource[j].Parent.Priority;
				}
				if(CategoriesIndex[iCatID]==null) {
					CategoriesIndex[iCatID] = Categories.push({Name: sCategory, Priority: iPriority, GeoObjects: []}) - 1;
				}
				Categories[CategoriesIndex[iCatID]].GeoObjects.push(oDataSource[j]);
			}
			for(var j in Categories){
				if(Categories[j].GeoObjects.length == 1 && Categories[j].Name != ""){
					if(CategoriesIndex["0"]==null) {
						CategoriesIndex["0"] = Categories.push({Name: "", Priority: 9999999, GeoObjects: []})-1;
					}
					Categories[CategoriesIndex["0"]].GeoObjects.push(Categories[j].GeoObjects[0]);
					Categories[j] = null;
				}
			}
			Categories.sort(function(a, b){
				if (a == null || b == null) return 0;
				if (a.Priority < b.Priority)
					return 1;
				if (a.Priority > b.Priority)
					return -1;
				if (a.Name > b.Name)
					return 1;
				if (a.Name < b.Name)
					return -1;
				return 0;
			});
		}
		return arrResultDataSources;
	}

	/**Осуществляет поиск по переданной строке
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>layersSearchFlag</i> - признак необходимости искать по векторным слоям </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Limit</i> - максимальное число найденных объектов
		<i>WithoutGeometry<i> - не передавать геометрию в результатах поиска
		<i>RequestType<i> - Тип запроса к серверу
        <i>PageNum<i> - Показать страницу
        <i>ShowTotal<i> - Сообщить сколько найдено всего записей
        <i>UseOSM<i> - Искать в базе OSM
	@returns {void}*/
	this.SearchByString = function(params){
	    oSearchDataProvider.SearchByString({
            SearchString: params.SearchString,
            IsStrongSearch: params.IsStrongSearch,
            Limit: params.Limit,
            WithoutGeometry: params.WithoutGeometry || WithoutGeometry,
            PageNum: params.PageNum,
            ShowTotal: params.ShowTotal,
            UseOSM: 'UseOSM' in params ? params.UseOSM : useOSMDefault,
			layersSearchFlag: params.layersSearchFlag,
			callback: function(response) {
				for(var i=0; i<response.length; i++)	response[i].CanDownloadVectors = false;
				if (params.layersSearchFlag){
					var arrLayerSearchResult = oSearchDataProvider.LayerSearch(params.SearchString, null, function(arrLayerSearchResult){
						params.callback(response.concat(arrLayerSearchResult));
					});
				}
				else {
					params.callback(response);
				}
			}
		});
	};

	/**Получает информацию об объекте
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>ID</i> - идентификатор объекта </br>
	@returns {void}*/
	this.SearchID = function(params){
		oSearchDataProvider.SearchID({
            callback: params.callback,
            ID: params.ID,
            TypeCode: params.TypeCode,
            UseOSM: 'UseOSM' in params ? params.UseOSM : useOSMDefault
        });
	}

	/**Осуществляет поиск текущего местонахождения
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
	@returns {void}*/
	this.SearchLocation = function(params){
		oSearchDataProvider.SearchLocation({callback: params.callback, Geometry: params.Geometry});
	}

    /**Осуществляет поиск ближайшего объекта к центру указанной области
    @param {object} params Параметры: </br>
    <i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
    <i>Geometry</i> - область </br>
    @returns {void}*/
    this.SearchNearest = function (params) {
        oSearchDataProvider.SearchNearest({ callback: params.callback, Geometry: params.Geometry });
    }

	/**Осуществляет поиск по произвольным параметрам
	@param {object} params Параметры: </br>
		<i>callback</i> = function(arrResultDataSources) - вызывается после получения ответа от сервера </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
		<i>Limit</i> - максимальное число найденных объектов
		<i>WithoutGeometry<i> - не передавать геометрию в результатах поиска
		<i>RequestType<i> - Тип запроса к серверу
	@returns {void}*/
	this.Search = function(params){
		oSearchDataProvider.Search({
			callback: params.callback,
			SearchString: params.SearchString,
			IsStrongSearch: params.IsStrongSearch,
			Limit: params.Limit == null ? iDefaultLimit : params.Limit,
			Geometry: params.Geometry,
			WithoutGeometry: params.WithoutGeometry
		});
	};

	/** Возвращает адрес сервера, на котором установлен поисковый модуль Geomixer'а */
	this.GetServerBase = function(){
		return oSearchDataProvider.GetServerBase();
	}
}

/** Возвращает контрол, содержащий все все компоненты поиска и обеспечивающий их взаимодействие между собой
* @memberof Search
* @param {object} params Параметры:
*
*  * ServerBase - Адрес сервера, на котором установлен поисковый модуль Geomixer'а
*  * ImagesHost - строка пути к картинкам
*  * ContainerInput - Объект, в котором находится контрол поискового поля (div)
*  * layersSearchFlag - Признак видимости кнопки поиска по векторным слоям
*  * ContainerList - Объект, в котором находится контрол результатов поиска в виде списка(div)
*  * Map - карта, на которой будут рисоваться объекты
*  * gmxMap - карта с векторными слоями
*  * WithoutGeometry - не передавать геометрию в результатах поиска
*
* @returns {Search.SearchControl}
*/
var SearchControlGet = function (params){
    var map = params.Map;
	var oLogic = new SearchLogicGet(params.ServerBase, params.gmxMap, params.WithoutGeometry);
	var fnAutoCompleteSource = function (request, response) {
		oLogic.AutoCompleteData(request.term, response);
	}
	/**Результаты поиска*/
	var lstResult = new ResultListMapGet(params.ContainerList, map, params.ImagesHost);
	/**Строка ввода поискового запроса*/
	var btnSearch = new SearchInput(params.ContainerInput, {
		ImagesHost: params.ImagesHost,
		layersSearchFlag: params.layersSearchFlag,
		AutoCompleteSource: fnAutoCompleteSource
	});
    var oLocationTitleRenderer = new LocationTitleRenderer(map, typeof (gmxGeoCodeShowNearest) != "undefined" && gmxGeoCodeShowNearest ? oLogic.SearchNearest:oLogic.SearchLocation);
	SearchControl.call(this, btnSearch, lstResult, oLogic, oLocationTitleRenderer);

    this.addSearchByStringHook(function(searchString) {
        var pos = L.gmxUtil.parseCoordinates(searchString);
        if (pos) {
            nsGmx.leafletMap.panTo(pos);

            // Добавим иконку по умолчанию
            // L.Icon.Default.imagePath = 'leaflet/images';
            nsGmx.leafletMap.gmxDrawing.add(L.marker(pos, { draggable: true, title: searchString }));
            // Либо задать свою иконку
            // nsGmx.leafletMap.gmxDrawing.add(L.marker(pos, {
                // draggable: true, title: searchString,
                // icon: L.icon({ iconUrl: 'img/flag_blau1.png', iconAnchor: [6, 36] })
            // }));

            //map.moveTo(pos[0], pos[1], map.getZ());
            //map.drawing.addObject({ type: "POINT", coordinates: pos }, { text: searchString });
            return true;
        }
    })
}
SearchControlGet.prototype = SearchControl;

/** Конструктор
 @class Контрол, содержащий все все компоненты поиска и обеспечивающий их взаимодействие между собой
 @memberof Search
 @param oInitInput Текстовое поле ввода
 @param oInitResultListMap Отображение результатов поиска
 @param oInitLogic Слой бизнес-логики
 @param oInitLocationTitleRenderer Отображение на карте текущего местоположения
*/
var SearchControl = function(oInitInput, oInitResultListMap, oInitLogic, oInitLocationTitleRenderer){
	var _this = this;

	var oLogic = oInitLogic;
	/**Результаты поиска*/
	var lstResult = oInitResultListMap;
	/**Строка ввода поискового запроса*/
	var btnSearch = oInitInput;
    /**Максимальное количество результатов на странице*/
	var iLimit = typeof (GeocodePageResults) == "number" ? GeocodePageResults : 10;

	var oLocationTitleRenderer = oInitLocationTitleRenderer;

    var searchByStringHooks = [];

	/**Осуществляет загрузку SHP-файла*/
	var fnDownloadSHP = function(event, filename, arrObjectsToDownload){
        var features = arrObjectsToDownload.map(function(obj) {
            return {
                type: 'Feature',
                geometry: L.gmxUtil.geometryToGeoJSON(obj.Geometry),
                properties: {title: '' + obj.Path}
            }
        });

        nsGmx.Utils.downloadGeometry(features, {FileName: filename});
	};

	var fnBeforeSearch = function(){
		/** Генерируется перед началом поиска
		@name Search.SearchControl.onBeforeSearch
		@event*/
		$(_this).triggerHandler('onBeforeSearch');
	}
	
	var fnAfterSearch = function(){
		/** Генерируется после окончания поиска
		@name Search.SearchControl.onAfterSearch
		@event*/
		$(_this).triggerHandler('onAfterSearch');
	}

	/**Осуществляет поиск*/
	var fnSearchByString = function(event, SearchString, layersSearchFlag)
	{
		//try{
	        deferredsChain(oLogic.SearchStarting(), {searchString:SearchString, lstResult: lstResult}).done(function(fin){
				//console.log('finally ' + fin);
				if (fin!=-1){			
			
            for (var h = 0; h < searchByStringHooks.length; h++) {
                if (searchByStringHooks[h].hook(SearchString)) {
                    return;
                }
            }
			fnBeforeSearch();
            lstResult.ShowLoading();
            oLogic.SearchByString({ SearchString: SearchString, IsStrongSearch: true, layersSearchFlag: layersSearchFlag, Limit: iLimit, PageNum: 0, ShowTotal: 1,
            callback: function (response) {
                lstResult.ShowResult(SearchString, response);
                lstResult.CreatePager(response, function (e) {
                    var evt = e || window.event,
                    active = evt.srcElement || evt.target
                    oLogic.SearchByString({ SearchString: SearchString, IsStrongSearch: true, Limit: iLimit, PageNum: parseInt($(this).text()) - 1, ShowTotal: 0,
                        callback: function (response) {
                            lstResult.ShowResult(SearchString, response);
                            $('#prevpages~span:visible').attr('class', 'buttonLink');
                            for (var i=0; i<$('#prevpages~span:visible').length; ++i) attachEffects($('#prevpages~span:visible')[i], 'buttonLinkHover');
                            $(active).attr('class', 'page');
                            attachEffects(active, '');
							fnAfterSearch();
                        }
                    });
                });
                fnAfterSearch();
            }});
						
				}
			});			
		//}
		//catch (e){
		//	lstResult.ShowError(e);
		//}
	}

	/**Осуществляет выбор объекта из подсказки*/
	var fnSelect = function(event, oAutoCompleteItem){
        if(oAutoCompleteItem.GeoObject==null)
            return;
	    if (fnBeforeSearch != null) fnBeforeSearch();
	    $('#respager').remove();
	    oLogic.SearchID({ID: oAutoCompleteItem.GeoObject.ObjCode, RequestType: "ID", TypeCode: oAutoCompleteItem.GeoObject.TypeCode,
                            callback: function (response) {
                                lstResult.ShowResult(oAutoCompleteItem.label, [{ name: "Выбрано", SearchResult: response[0].SearchResult}]);
                        }
                        });
		if (fnAfterSearch != null) fnAfterSearch();
	}


	var onDisplayedObjectsChanged = function(event, iDataSourceN, arrFoundObjects){
		/** Вызывается при изменении отображаемого списка найденных объектов(ведь они отображаются не все)
		@name Search.SearchControl.onDisplayedObjectsChanged
		@event
		@param {int} iDataSourceN № источника данных(группы результатов поиска)
		@param {object[]} arrDSDisplayedObjects Результаты поиска, которые необходимо отобразить в текущей группе*/
		$(_this).triggerHandler('onDisplayedObjectsChanged', [iDataSourceN, arrFoundObjects]);
	}

	var onObjectClick = function(event, oFoundObject){
		/** Вызывается при клике на найденный объект в списке результатов поиска
		@name Search.SearchControl.onObjectClick
		@event
		@param {object} oFoundObject Найденный объект*/
		$(_this).triggerHandler('onObjectClick', [oFoundObject]);
	}

	$(lstResult).bind('onDisplayedObjectsChanged', onDisplayedObjectsChanged);
	$(lstResult).bind('onObjectClick', onObjectClick);
	$(lstResult).bind('onDownloadSHP', fnDownloadSHP);
	$(btnSearch).bind('Search', fnSearchByString);
	$(btnSearch).bind('AutoCompleteSelect', fnSelect);
	if (oLocationTitleRenderer != null) {
		$(oLocationTitleRenderer).bind('onObjectClick', function(event, oFoundObject){
			lstResult.CenterObject(oFoundObject);
			onObjectClick(event, oFoundObject);
		});
	}
	/**Осуществляет поиск по произвольным параметрам по адресной базе
	@param {object} params Параметры: </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
		<i>Limit</i> - максимальное число найденных объектов
	@returns {void}*/
	this.Search = function(params){
		try{
			var sSearchString = params.SearchString || '';
			if (sSearchString == '' && params.Geometry == null) throw "Error in SearchControl: Не заданы параметры поиска!";
			if (sSearchString == '') sSearchString = 'Поиск по выделенной области';
			lstResult.ShowLoading();
			if (fnBeforeSearch != null) fnBeforeSearch();
			oLogic.Search({
				SearchString: params.SearchString,
				IsStrongSearch: params.IsStrongSearch,
				Limit: params.Limit,
				Geometry: params.Geometry,
				callback: function(arrResultDataSources){
					lstResult.ShowResult(sSearchString, arrResultDataSources);
					if (fnAfterSearch != null) fnAfterSearch();
				}
			});
		}
		catch (e){
			lstResult.ShowError();
		}
	};

	/**Возвращает стоку поиска*/
	this.GetSearchString = function(){
		return btnSearch.GetSearchString();
	}

	/**Устанавливает строку поиска*/
	this.SetSearchString = function(value){
		btnSearch.SetSearchString(value);
	}
	this.SetSearchStringFocus = function(value){
		btnSearch.SetSearchStringFocus(value);
	}

	/**Устанавливает подсказку строки поиска*/
	this.SetPlaceholder = function(value){
		btnSearch.SetPlaceholder(value);
	}

	/**Показывает режим загрузки
	@returns {void}*/
	this.ShowLoading = function(){
		lstResult.ShowLoading();
	}

	/**Очищает результаты поиска
	@returns {void}*/
	this.Unload = function(){lstResult.Unload();};

    /**
    Добавление наблюдателя события начала оработки поискового запроса
        @param {observer:{add:bool, remove:bool, observer:function(next, deferred, params)}}, selectItem:function(){}}} 
    */
    this.onSearchStarting = function(params){
        oLogic.SearchStarting(params.observer);
        //$(btnSearch).bind('AutoCompleteSelect', params.selectItem);
    }
	
    /**
    Добавление наблюдателя события начала оработки запроса для подсказки
        @param {observer:{add:bool, remove:bool, observer:function(next, deferred, params)}}, selectItem:function(){}}}
    */
    this.onAutoCompleteDataSearchStarting = function(params){
        oLogic.AutoCompleteDataSearchStarting(params.observer);
        $(btnSearch).bind('AutoCompleteSelect', params.selectItem);
    }

    /**Добавляет хук поиска объектов по строке. Хуки выполняются в порядке их добавления с учётом приоритета
    @param {function} hook - ф-ция, которая принимает на вход строку поиска и возвращает признак прекращения дальнейшего поиска (true - прекратить)
    @param {Number} [priority=0] - приоритет хука. Чем больше значение, тем раньше будет выполняться
	@returns {void}*/
    this.addSearchByStringHook = function(hook, priority) {
        searchByStringHooks.push({
            hook: hook,
            priority: priority || 0,
            index: searchByStringHooks.length
        });

        searchByStringHooks.sort(function(a, b) {
            return b.priority - a.priority || a.index - b.index;
        })
    }

    /**Удаляет хук поиска объектов по строке
    @param {function} hook - хук, который нужно удалить
	*/
    this.removeSearchByStringHook = function(hook) {
		if (arguments.length==0){
			searchByStringHooks = [];
			return;
		}		
        for (var h = 0; h < searchByStringHooks.length; h++) {
            if (searchByStringHooks[h].hook === hook) {
                searchByStringHooks.splice(h, 1);
                return;
            }
        }
    }
}

/**Конструктор без параметров
 @class SearchGeomixer Контрол, содержащий все все компоненты поиска и встраивающий их во Viewer
 @memberof Search*/
var SearchGeomixer = function(){
	var _this = this;
	var oMenu;
	var oSearchControl;

	var oSearchInputDiv = _div();
	var oSearchResultDiv = _div();
	var workCanvas;

	_title(oSearchInputDiv, _gtxt('Изменить параметры поиска'));

	var fnLoad = function(){
		if (oMenu != null){
			var alreadyLoaded = oMenu.createWorkCanvas("search", fnUnload);
			if(!alreadyLoaded) _(oMenu.workCanvas, [oSearchResultDiv]);
		}
	}
	var fnUnload = function(){
		if (oSearchControl != null)oSearchControl.Unload();
	}

	var fnBeforeSearch = function(event){
		/** Вызывается перед началом поиска
		@name Search.SearchGeomixer.onBeforeSearch
		@event */
		$(_this).triggerHandler('onBeforeSearch');
		fnLoad();
	}

	var fnAfterSearch = function(event){
		/** Вызывается после окончания поиска
		@name Search.SearchGeomixer.onAfterSearch
		@event */
		$(_this).triggerHandler('onAfterSearch');
	}

	var onDisplayedObjectsChanged = function(event, iDataSourceN, arrFoundObjects){
		/** Вызывается при изменении отображаемого списка найденных объектов(ведь они отображаются не все)
		@name Search.SearchGeomixer.onDisplayedObjectsChanged
		@event
		@param {int} iDataSourceN № источника данных(группы результатов поиска)
		@param {object[]} arrDSDisplayedObjects Результаты поиска, которые необходимо отобразить в текущей группе*/
		$(_this).triggerHandler('onDisplayedObjectsChanged', [iDataSourceN, arrFoundObjects]);
	}

	var onObjectClick = function(event, oFoundObject){
		/** Вызывается при клике на найденный объект в списке результатов поиска
		@name Search.SearchGeomixer.onObjectClick
		@event
		@param {object} oFoundObject Найденный объект*/
		$(_this).triggerHandler('onObjectClick', [oFoundObject]);
	}

	/**Инициализирует контрол
	@param {object} params Параметры: </br>
		<i>ServerBase</i> - Адрес сервера, на котором установлен поисковый модуль Geomixer'а </br>
		<i>ContainerInput</i> - Объект, в котором находится контрол поискового поля (div) </br>
		<i>layersSearchFlag</i> - Признак видимости кнопки поиска по векторным слоям </br>
		<i>ContainerList</i> - Объект, в котором находится контрол результатов поиска в виде списка(div) </br>
		<i>Map</i> - карта, на которой будут рисоваться объекты </br>
		<i>MapHelper</i> - вспомогательный компонент для работы с картой </br>
	@returns {void}*/
	this.Init = function(params){
		if (oMenu == null) oMenu = params.Menu;
		if (oMenu == null) throw "Error in SearchGeomixer: Menu is null";
		_(params.ContainerInput, [oSearchInputDiv]);
		oSearchControl = new SearchControlGet({ServerBase: params.ServerBase,
											ImagesHost: params.ServerBase + "/api/img",
											ContainerInput: oSearchInputDiv,
											layersSearchFlag: params.layersSearchFlag,
											ContainerList: oSearchResultDiv,
											Map: params.Map,
                                            gmxMap: params.gmxMap});
		$(oSearchControl).bind('onBeforeSearch', fnBeforeSearch);
		$(oSearchControl).bind('onAfterSearch', fnAfterSearch);
		$(oSearchControl).bind('onDisplayedObjectsChanged', onDisplayedObjectsChanged);
		$(oSearchControl).bind('onObjectClick', onObjectClick);
	}

	/** Загружает контрол в левое меню
	@returns {void}*/
	this.Load = function(){
		fnLoad();
	}

	/** Выгружает контрол из левого меню
	@returns {void}*/
	this.Unload = function(){
		fnUnload();
	}

	/**Осуществляет поиск по произвольным параметрам по адресной базе
	@param {object} params Параметры: </br>
		<i>SearchString</i> - строка для поиска </br>
		<i>IsStrongSearch</i> - признак того, что искать только целые слова </br>
		<i>Geometry</i> - искать только объекты, пересекающие данную геометрию </br>
		<i>Limit</i> - максимальное число найденных объектов
	@returns {void}*/
	this.Search = function(params){
		oSearchControl.Search({
			SearchString: params.SearchString,
			IsStrongSearch: params.IsStrongSearch,
			Limit: params.Limit,
			Geometry: params.Geometry
		});
	};

	/**Возвращает стоку поиска*/
	this.GetSearchString = function(){
		return oSearchControl.GetSearchString();
	}

	/**Устанавливает строку поиска*/
	this.SetSearchString = function(value){
		oSearchControl.SetSearchString(value);
	}
	this.SetSearchStringFocus = function(value){
		oSearchControl.SetSearchStringFocus(value);
	}
	/**Устанавливает подсказку строки поиска*/
	this.SetPlaceholder = function(value){
		oSearchControl.SetPlaceholder(value);
	}

    this.getSearchControl = function() {
        return oSearchControl;
    }
}

var publicInterface = {
	SearchGeomixer: SearchGeomixer,
	SearchControl: SearchControl,
	SearchControlGet: SearchControlGet,
	SearchInput: SearchInput,
	ResultList: ResultList,
	ResultRenderer: ResultRenderer,
	ResultListMap: ResultListMap,
	ResultListMapGet: ResultListMapGet,
	SearchDataProvider: SearchDataProvider,
	SearchLogic: SearchLogic,
	SearchLogicGet: SearchLogicGet,
	LocationTitleRenderer: LocationTitleRenderer,
	Functions: Functions
}

gmxCore.addModule("search", publicInterface, {
    init: function() {
        //Очень суровое решение для разруливания конфликтов с глобальными переменными.
        _ = nsGmx.Utils._;
        _input = nsGmx.Utils._input;
        _td = nsGmx.Utils._td;
        _tr = nsGmx.Utils._tr;
        _div = nsGmx.Utils._div;
        _t = nsGmx.Utils._t;
        _table = nsGmx.Utils._table;
        _tbody = nsGmx.Utils._tbody;
        _img = nsGmx.Utils._img;
        _span = nsGmx.Utils._span;
        _li = nsGmx.Utils._li;
        _ul = nsGmx.Utils._ul;
        _form = nsGmx.Utils._form;

        initTranslations();
    }
});

})(jQuery);
