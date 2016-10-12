﻿//Необходимо подключить JS-библиотеки: jquery, jquery-ui, api.js, utilites.js, treeview.js, translations.js, gmxCore.js, 	файл локализации
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
				minLength: params.minLetters,
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
                var icon = "";
                if (item.iconClass) {
                    icon = '<div style="float:left" class="' + item.iconClass + '"></div>';
                }
                return $( "<li></li>" )
                    .data( "item.autocomplete", item )
                    .append(icon + "<a>" + t + "</a>")
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
*  * minLetters - минимальное кол-во символов для поиска. 3 - по умолчанию
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
		AutoCompleteSource: fnAutoCompleteSource,
        minLetters: params.minLetters || 3
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
