/* Attributes editor panel 
	Dependencies: 
		- jQuery
		- jQuery UI (sliders)
		- jscolor.js
*/

/* LiteWiget options:
	+ name_width: the width of the widget name area

*/

jQuery.fn.wchange = function(callback) {
	$(this[0]).on("wchange",callback);
};

jQuery.fn.wclick = function(callback) {
	$(this[0]).on("wclick",callback);
};

/**
* Inspector allows to create a list of widgets easily
*
* @class Inspector
* @param {string} id
* @param {Object} options useful options are { width, widgets_width, name_width, full, widgets_per_row }
* @constructor
*/

function Inspector(id,options)
{
	options = options || {};
	this.root = document.createElement("DIV");
	this.root.className = "inspector " + ( options.full ? "full" : "");
	if(options.one_line)
	{
		this.one_line = true;
		this.root.className += " one_line";
	}

	if(id)
		this.root.id = id;

	this.values = {};
	this.sections = [];
	this.widgets = {};

	this.addSection();
	this.tab_index = Math.floor(Math.random() * 10000);

	if(options.name_width)
		this.name_width = options.name_width;
	if(options.widgets_width)
		this.widgets_width = options.widgets_width;

	if(options.parent) this.appendTo(options.parent);
	this.widgets_per_row = options.widgets_per_row || 1;
}

Inspector.prototype.appendTo = function(parent, at_front)
{
	if(at_front)
		$(parent).prepend(this.root);
	else
		$(parent).append(this.root);
}

/**
* Removes all the widgets inside the inspector
* @method clear
*/
Inspector.prototype.clear = function()
{
	purgeElement( this.root, true ); //hack, but doesnt seem to work
	this.root.innerHTML = "";

	this.sections = [];
	this.values = {};
	this.widgets = {};

	this.current_container = null;
	this._current_container_stack = null;
	this.addSection();
}

/**
* Tryes to refresh (calls on_refresh)
* @method clear
*/
Inspector.prototype.refresh = function()
{
	if(this.on_refresh)
		this.on_refresh();
}

Inspector.prototype.append = function(widget, options)
{
	var root = this.root;
	if( this.current_container )
		root = this.current_container;
	else if( this.current_group_content )
		root = this.current_group_content;
	else if( this.current_section_content )
		root = this.current_section_content;

	if(options && options.replace)
		options.replace.parentNode.replaceChild( widget, options.replace );
	else
		root.appendChild( widget );
}

Inspector.prototype.pushContainer = function( element )
{
	if(!this._current_container_stack)
		this._current_container_stack = [ element ];
	else
		this._current_container_stack.push( element );

	this.current_container = element;
}

Inspector.prototype.popContainer = function()
{
	if(this._current_container_stack && this._current_container_stack.length)
	{
		this._current_container_stack.pop();
		this.current_container = this._current_container_stack[ this._current_container_stack.length - 1 ];
	}
	else
		this.current_container = null;
}

Inspector.prototype.setup = function(info)
{
	for(var i in info)
	{
		var w = info[i];
		var widget = this.add(w.type,w.name,w.value,w.options);
	}
}

/**  Given an instance it shows all the attributes
*
* @method inspectInstance
* @param {Object} instance the instance that you want to inspect, attributes will be collected from this object
* @param {Array} attrs an array with all the names of the properties you want to inspect, 
*		  if not specified then it calls getAttributes, othewise collect them and tries to guess the type
* @param {Object} attrs_info_example it overwrites the info about properties found in the object (in case the guessed type is wrong)
*/
Inspector.prototype.inspectInstance = function(instance, attrs, attrs_info_example, attributes_to_skip ) 
{
	if(!instance)
		return;

	if( !attrs && instance.getAttributes )
		attrs = instance.getAttributes();
	else
		attrs = this.collectAttributes(instance);

	var classObject = instance.constructor;
	if(!attrs_info_example && classObject.attributes)
		attrs_info_example = classObject.attributes;

	//clone to ensure there is no overlap between widgets reusing the same container
	var attrs_info = {};

	//add to attrs_info the ones that are not specified 
	for(var i in attrs)
	{
		if(attrs_info_example && attrs_info_example[i])
		{
			//clone
			attrs_info[i] = inner_clone( attrs_info_example[i] );
			continue;
		}

		var v = attrs[i];

		if(classObject["@" + i]) //in class object
		{
			var shared_options = classObject["@" + i];
			attrs_info[i] = inner_clone( shared_options );
			/*
			for(var j in shared_options) //clone, because cannot be shared or errors could appear
				options[j] = shared_options[j];
				attrs_info[i] = options;
			*/
		}
		else if(instance["@" + i])
			attrs_info[i] = instance["@" + i];
		else if (typeof(v) == "number")
			attrs_info[i] = { type: "number", step: 0.1 };
		else if (typeof(v) == "string")
			attrs_info[i] = { type: "string" };
		else if (typeof(v) == "boolean")
			attrs_info[i] = { type: "boolean" };
		else if( v && v.length )
		{
			switch(v.length)
			{
				case 2: attrs_info[i] = { type: "vec2", step: 0.1 }; break;
				case 3: attrs_info[i] = { type: "vec3", step: 0.1 }; break;
				case 4: attrs_info[i] = { type: "vec4", step: 0.1 }; break;
				default: continue;
			}
		}
	}

	if(attributes_to_skip)
		for(var i in attributes_to_skip)
			delete attrs_info[ attributes_to_skip[i] ];

	//showAttributes doesnt return anything but just in case...
	return this.showAttributes( instance, attrs_info );

	//basic cloner
	function inner_clone(original, target)
	{
		target = target || {};
		for(var j in original)
			target[j] = original[j];
		return target;
	}
}

/**  extract all attributes from an instance (enumerable properties that are not function and a name starting with alphabetic character)
*
* @method collectAttributes
**/
Inspector.prototype.collectAttributes = function(instance)
{
	var attrs = {};

	for(var i in instance)
	{
		if(i[0] == "_" || i[0] == "@" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
			continue;

		var v = instance[i];
		if ( v && v.constructor == Function )
			continue;
		attrs[i] = v;
	}
	return attrs;
}

//adds the widgets for the attributes specified in attrs_info of instance
Inspector.prototype.showAttributes = function( instance, attrs_info ) 
{
	//for every enumerable property create widget
	for(var i in attrs_info)
	{
		var options = attrs_info[i];
		if(!options.callback)
		{
			var o = { instance: instance, name: i, options: options };
			options.callback = Inspector.assignValue.bind(o);

		}
		options.instance = instance;

		var type = options.type || options.widget || "string";

		//used to hook stuff on special occasions
		if( this.on_addAttribute )
			this.on_addAttribute( type, instance, i, instance[i], options );

		this.add( type, i, instance[i], options );
	}

	//extra widgets inserted by the object (stored in the constructor)
	if(instance.constructor.widgets)
		for(var i in instance.constructor.widgets)
		{
			var w = instance.constructor.widgets[i];
			this.add( w.widget, w.name, w.value, w );
		}

	//used to add extra widgets
	if(instance.onShowAttributes)
		instance.onShowAttributes(this);

	if(instance.constructor.onShowAttributes)
		instance.constructor.onShowAttributes(instance, this);
}

Inspector.assignValue = function(value)
{
	var instance = this.instance;
	var current_value = instance[this.name];

	if(current_value == null || value == null || this.options.type == "enum")
		instance[this.name] = value;
	else if(typeof(current_value) == "number")
		instance[this.name] = parseFloat(value);
	else if(typeof(current_value) == "string")
		instance[this.name] = value;
	else if(value && value.length && current_value && current_value.length)
	{
		for(var i = 0; i < value.length; ++i)
			current_value[i] = value[i];
	}
	else
		instance[this.name] = value;
}

Inspector.prototype.createWidget = function(name, content, options) 
{
	options = options || {};
	content = content || "";
	var element = document.createElement("DIV");
	element.className = "widget " + (options.className || "");
	element.inspector = this;
	element.options = options;
	element.name = name;

	var width = options.width || this.widgets_width;
	if(width)
	{
		element.style.width = typeof(width) == "string" ? width : width + "px";
		element.style.minWidth = element.style.width;
	}

	if(name)
		this.widgets[name] = element;

	if(this.widgets_per_row != 1)
	{
		if(!options.width)
			element.style.width = (100 / this.widgets_per_row).toFixed(2) + "%";
		element.style.display = "inline-block";
	}

	var namewidth = "";
	var contentwidth = "";
	if(name != null && (this.name_width || options.name_width) && !this.one_line)
	{
		var w = options.name_width || this.name_width;
		if(typeof(w) == "number") w = w.toFixed() + "px";
		namewidth = "style='width: calc(" + w + " - 0px); width: -webkit-calc(" + w + " - 0px); width: -moz-calc(" + w + " - 0px); '"; //hack 
		contentwidth = "style='width: calc( 100% - " + w + "); width: -webkit-calc(100% - " + w + "); width: -moz-calc( 100% - " + w + "); '";
	}

	var code = "";
	var pretitle = "";
	var filling = this.one_line ? "" : "<span class='filling'>....................</span>";

	if(options.pretitle)
		pretitle = options.pretitle;

	var content_class = "wcontent ";
	var title = name;
	if(options.title)
		title = options.title;
	if(name == null)
		content_class += " full";
	else if(name == "")
		code += "<span class='wname' title='"+title+"' "+namewidth+">"+ pretitle +"</span>";
	else
		code += "<span class='wname' title='"+title+"' "+namewidth+">"+ pretitle + name + filling + "</span>";

	if(typeof(content) == "string")
		element.innerHTML = code + "<span class='info_content "+content_class+"' "+contentwidth+">"+content+"</span>";
	else
	{
		element.innerHTML = code + "<span class='info_content "+content_class+"' "+contentwidth+"></span>";
		$(element).find("span.info_content").append(content);
	}

	return element;
}

//calls callback, triggers wchange, calls onchange in Inspector
Inspector.onWidgetChange = function(element, name, value, options, expand_value )
{
	this.values[name] = value;
	//LiteGUI.trigger( this.current_section, "wchange", value );
	$(this.current_section).trigger("wchange",value); //used for undo //TODO: REMOVE
	var r = undefined;
	if(options.callback)
	{
		if(expand_value)
			r = options.callback.apply( element, value );
		else
			r = options.callback.call( element, value );
	}

	//LiteGUI.trigger( element, "wchange", value );
	$(element).trigger("wchange",value); //TODO: REPLACE by LiteGUI.trigger
	if(this.onchange) 
		this.onchange(name, value, element);
	return r;
}

Inspector.widget_constructors = {
	title: 'addTitle',
	info: 'addInfo',
	number: 'addNumber',
	slider: 'addSlider',
	string: 'addString',
	text: 'addString',
	textarea: 'addTextarea',
	color: 'addColor',
	"boolean": 'addCheckbox', 
	checkbox: 'addCheckbox',
	icon: 'addIcon',
	vec2: 'addVector2',
	vector2: 'addVector2',
	vec3: 'addVector3',
	vector3: 'addVector3',
	vec4: 'addVector4',
	vector4: 'addVector4',
	"enum": 'addCombo',
	combo: 'addCombo',
	button: 'addButton',
	buttons: 'addButtons',
	file: 'addFile',
	line: 'addLine',
	list: 'addList',
	tree: 'addTree',
	datatree: 'addDataTree',
	separator: 'addSeparator'
};


Inspector.registerWidget = function(name, callback)
{
	var func_name = "add" + name.charAt(0).toUpperCase() + name.slice(1);
	Inspector.prototype[func_name] = callback;
	Inspector.widget_constructors[name] = func_name;
}

Inspector.prototype.add = function(type,name,value,options)
{
	if(typeof(type) == "object" && arguments.length == 1)
	{
		options = type;
		type = options.type;
		name = options.name;
		value = options.value;
	}

	var func = Inspector.widget_constructors[type];
	if(!func){
		console.warn("LiteGUI.Inspector do not have a widget called",type);
		return;
	}

	if(typeof(func) == "string")
		func = Inspector.prototype[func];
	if(!func) return;
	if(typeof(func) != "function") return;

	if(typeof(options) == 'function')
		options = { callback: options };
	
	return func.call(this, name,value, options);
}

Inspector.prototype.getValue = function(name)
{
	return this.values[name];
}

Inspector.prototype.set = function(name, value)
{
	//TODO
}

Inspector.prototype.addContainer = function(name, options)
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	element.className = "wcontainer";
	if(options.className)
		element.className += " " + options.className;
	if(options.id)
		element.id = options.id;

	this.append( element );
	this.pushContainer( element );

	if(options.widgets_per_row)
		this.widgets_per_row = options.widgets_per_row;

	element.refresh = function()
	{
		if(element.on_refresh)
			element.on_refresh.call(this, element);
	}
	return element;
}

Inspector.prototype.endContainer = function(name, options)
{
	this.popContainer();
}


Inspector.prototype.addSection = function(name, options)
{
	if(this.current_group)
		this.endGroup();

	options = this.processOptions(options);

	var element = document.createElement("DIV");
	element.className = "wsection";
	if(!name) element.className += " notitle";
	if(options.className)
		element.className += " " + options.className;
	if(options.collapsed)
		element.className += " collapsed";

	if(options.id)
		element.id = options.id;
	if(options.instance)
		element.instance = options.instance;

	var code = "";
	if(name)
		code += "<div class='wsectiontitle'>"+(options.no_collapse ? "" : "<span class='switch-section-button'></span>")+name+"</div>";
	code += "<div class='wsectioncontent'></div>";
	element.innerHTML = code;
	this.root.appendChild(element);

	if(name)
		element.querySelector(".wsectiontitle").addEventListener("click",function(e) {
			if(e.target.localName == "button") 
				return;
			element.classList.toggle("collapsed");
			var seccont = element.querySelector(".wsectioncontent");
			seccont.style.display = seccont.style.display === "none" ? null : "none";
			if(options.callback)
				options.callback.call( element, !element.classList.contains("collapsed") );
		});

	if(options.collapsed)
		element.querySelector(".wsectioncontent").style.display = "none";

	this.setCurrentSection( element );

	if(options.widgets_per_row)
		this.widgets_per_row = options.widgets_per_row;

	element.refresh = function()
	{
		if(element.on_refresh)
			element.on_refresh.call(this, element);
	}

	return element;
}


Inspector.prototype.setCurrentSection = function(element)
{
	if(this.current_group)
		this.endGroup();

	this.current_section = element;
	this.current_section_content = element.querySelector(".wsectioncontent");
	this.content = this.current_section_content; //shortcut
}

Inspector.prototype.getCurrentSection = function()
{
	return this.current_section;
}

Inspector.prototype.beginGroup = function(name, options)
{
	options = this.processOptions(options);

	if(this.current_group)
		this.endGroup();

	var element = document.createElement("DIV");
	element.className = "wgroup";
	name = name || "";
	element.innerHTML = "<div class='wgroupheader "+ (options.title ? "wtitle" : "") +"'><span class='wgrouptoggle'>-</span>"+name+"</div>";

	var content = document.createElement("DIV");
	content.className = "wgroupcontent";
	if(options.collapsed)
		content.style.display = "none";

	element.appendChild( content );

	var collapsed = options.collapsed || false;
	element.querySelector(".wgroupheader").addEventListener("click", function() { 
		var style = element.querySelector(".wgroupcontent").style;
		style.display = style.display === "none" ? "" : "none";
		collapsed = !collapsed;
		element.querySelector(".wgrouptoggle").innerHTML = (collapsed ? "+" : "-");
	});

	this.append(element, options);

	this.current_group = element;
	this.current_group_content = content;
	this.content = this.current_group_content; //shortcut

	return element;
}

Inspector.prototype.endGroup = function(options)
{
	this.current_group = null;
	this.current_group_content = null;
	this.content = this.current_section_content; //shortcut
}

Inspector.prototype.addTitle = function(title,options)
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	var code = "<span class='wtitle'><span class='text'>"+title+"</span>";
	if(options.help)
	{
		code += "<span class='help'><div class='help-content'>"+options.help+"</div></span>";
	}
	code += "</span>";
	element.innerHTML = code;

	element.setValue = function(v) { $(this).find(".text").html(v); };

	this.append(element, options);
	return element;
}

Inspector.prototype.addSeparator = function()
{
	var element = document.createElement("DIV");
	element.className = "separator";
	this.append(element);
	return element;
}

Inspector.prototype.addString = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;

	var inputtype = "text";
	if(options.password) 
		inputtype = "password";
	var focus = options.focus ? "autofocus" : "";

	var element = this.createWidget(name,"<span class='inputfield full "+(options.disabled?"disabled":"")+"'><input type='"+inputtype+"' tabIndex='"+this.tab_index+"' "+focus+" class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( options.immediate ? "keyup" : "change", function(e) { 
		var r = Inspector.onWidgetChange.call(that, element, name, e.target.value, options);
		if(r !== undefined)
			this.value = r;
	});

	this.tab_index += 1;

	element.setValue = function(v) { 
		input.value = v; 
		LiteGUI.trigger(input, "change" );
	};
	element.getValue = function() { return input.value; };
	element.focus = function() { $(this).find("input").focus(); };
	element.wchange = function(callback) { $(this).wchange(callback); }
	this.append(element,options);
	return element;
}

Inspector.prototype.addStringButton = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");
	input.addEventListener("change", function(e) { 
		var r = Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
		if(r !== undefined)
			this.value = r;
	});
	
	var button = element.querySelector(".wcontent button");
	button.addEventListener("click", function(e) { 
		if(options.callback_button)
			options.callback_button.call(element, input.value );
	});

	this.tab_index += 1;
	this.append(element,options);
	element.wchange = function(callback) { $(this).wchange(callback); }
	element.wclick = function(callback) { $(this).wclick(callback); }
	element.setValue = function(v) { input.value = v; LiteGUI.trigger(input, "change" ); };
	element.getValue = function() { return input.value; };
	element.focus = function() { $(this).find("input").focus(); };
	return element;
}

Inspector.prototype.addNumber = function(name, value, options)
{
	options = this.processOptions(options);

	if(!options.step)
		options.step = 0.1;

	value = value || 0;
	var that = this;
	this.values[name] = value;

	var element = this.createWidget(name,"", options);
	this.append(element,options);

	options.extraclass = "full";
	options.tab_index = this.tab_index;
	//options.dragger_class = "full";
	options.full = true;
	this.tab_index++;

	var dragger = new LiteGUI.Dragger(value, options);
	dragger.root.style.width = "calc( 100% - 1px )";
	element.querySelector(".wcontent").appendChild( dragger.root );
	$(dragger.root).bind("start_dragging", inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) 
			this.callback_before.call(element);
	}

	var input = element.querySelector("input");
	
	$(input).change( function(e) { 
		that.values[name] = e.target.value;
		//Inspector.onWidgetChange.call(that,this,name,ret, options);

		if(options.callback)
		{
			var ret = options.callback.call(element, parseFloat( e.target.value) ); 
			if( typeof(ret) == "number")
				this.value = ret;
		}
		$(element).trigger("wchange",e.target.value);
		if(that.onchange) that.onchange(name,e.target.value,element);
	});

	element.setValue = function(v) { 
		v = parseFloat(v);
		if(options.precision)
			v = v.toFixed( options.precision );
		input.value = v + (options.units || "");
		LiteGUI.trigger( input,"change" );
	};

	element.getValue = function() { return parseFloat( input.value ); };
	element.focus = function() { $(input).focus(); };

	return element;
}

Inspector.prototype.addVector2 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step ||0.1;
	//options.dragger_class = "medium";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var wcontent = element.querySelector(".wcontent");

	var dragger1 = new LiteGUI.Dragger(value[0], options);
	dragger1.root.style.marginLeft = 0;
	dragger1.root.style.width = "calc( 50% - 1px )";
	wcontent.appendChild( dragger1.root );

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger2 = new LiteGUI.Dragger(value[1], options);
	dragger2.root.style.width = "calc( 50% - 1px )";
	wcontent.appendChild( dragger2.root );

	$(dragger1.root).bind("start_dragging",inner_before_change.bind(options) );
	$(dragger2.root).bind("start_dragging",inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before(e);
	}

	//ALL INPUTS
	$(element).find("input").change( function(e) { 
		//gather all three parameters
		var r = [];
		var elems = $(element).find("input");
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call(element,r); 
			
			if(typeof(new_val) == "object" && new_val.length >= 2)
			{
				for(var i = 0; i < elems.length; i++)
					$(elems[i]).val(new_val[i]);
				r = new_val;
			}
		}

		$(element).trigger("wchange",[r]);
		if(that.onchange) that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function(v) { 
		dragger1.setValue(v[0]);
		dragger2.setValue(v[1]);
	}

	return element;
}

Inspector.prototype.addVector3 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step || 0.1;
	//options.dragger_class = "mini";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var dragger1 = new LiteGUI.Dragger(value[0], options );
	dragger1.root.style.marginLeft = 0;
	dragger1.root.style.width = "calc( 33% - 1px )";
	$(element).find(".wcontent").append(dragger1.root);

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger2 = new LiteGUI.Dragger(value[1], options );
	dragger2.root.style.width = "calc( 33% - 1px )";
	$(element).find(".wcontent").append(dragger2.root);

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger3 = new LiteGUI.Dragger(value[2], options );
	dragger3.root.style.width = "calc( 33% - 1px )";
	$(element).find(".wcontent").append(dragger3.root);

	$(dragger1.root).bind("start_dragging", inner_before_change.bind(options) );
	$(dragger2.root).bind("start_dragging", inner_before_change.bind(options) );
	$(dragger3.root).bind("start_dragging", inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before();
	}

	$(element).find("input").change( function(e) { 
		//gather all three parameters
		var r = [];
		var elems = $(element).find("input");
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call(element,r); 
			
			if(typeof(new_val) == "object" && new_val.length >= 3)
			{
				for(var i = 0; i < elems.length; i++)
					$(elems[i]).val(new_val[i]);
				r = new_val;
			}
		}

		$(element).trigger("wchange",[r]);
		if(that.onchange) that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function(v) { 
		dragger1.setValue(v[0]);
		dragger2.setValue(v[1]);
		dragger3.setValue(v[2]);
	}
	return element;
}

Inspector.prototype.addVector4 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step || 0.1;
	//options.dragger_class = "mini";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var draggers = [];

	for(var i = 0; i < 4; i++)
	{
		var dragger = new LiteGUI.Dragger(value[i], options );
		dragger.root.style.marginLeft = 0;
		dragger.root.style.width = "calc( 25% - 1px )";
		$(element).find(".wcontent").append(dragger.root);
		options.tab_index = this.tab_index;
		this.tab_index++;
		$(dragger.root).bind("start_dragging", inner_before_change.bind(options) );
		draggers.push(dragger);
	}

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before();
	}

	$(element).find("input").change( function(e) { 
		//gather all parameters
		var r = [];
		var elems = $(element).find("input");
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call(element,r); 
			if(typeof(new_val) == "object" && new_val.length >= 4)
			{
				for(var i = 0; i < elems.length; i++)
					$(elems[i]).val(new_val[i]);
				r = new_val;
			}
		}

		$(element).trigger("wchange",[r]);
		if(that.onchange) that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function(v) { 
		for(var i = 0; i < draggers.length; i++)
			draggers[i].setValue(v[i]);
	}
	return element;
}

Inspector.prototype.addTextarea = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	;

	var element = this.createWidget(name,"<span class='inputfield textarea "+(options.disabled?"disabled":"")+"'><textarea tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+">"+value+"</textarea></span>", options);
	this.tab_index++;

	element.querySelector(".wcontent textarea").addEventListener( options.immediate ? "keyup" : "change", function(e) { 
		Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	if(options.height)
		$(element).find("textarea").css({height: options.height });
	this.append(element,options);

	element.setValue = function(v) { $(this).find("textarea").val(v).change(); };
	return element;
}

Inspector.prototype.addInfo = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = null;
	if(name != null)
		element = this.createWidget(name,value, options);
	else
	{
		element = document.createElement("div");
		if(options.className)
			element.className = options.className;
		if(value.nodeName !== undefined)
		{
			element.innerHTML = "<span class='winfo'></span>";
			element.childNodes[0].appendChild( value );
		}
		else
			element.innerHTML = "<span class='winfo'>"+value+"</span>";
	}

	var info = element.querySelector(".winfo");

	element.setValue = function(v) { info.innerHTML = v; };

	if(options.height)
	{
		var content = element.querySelector("span.info_content");
		content.style.height = typeof(options.height) == "string" ? options.height : options.height + "px";
		content.style.overflow = "auto";
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.addSlider = function(name, value, options)
{
	options = this.processOptions(options);

	if(options.min === undefined)
		options.min = 0;

	if(options.max === undefined)
		options.max = 1;

	if(options.step === undefined)
		options.step = 0.01;

	var that = this;
	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield full'>\
				<input tabIndex='"+this.tab_index+"' type='text' class='slider-text fixed nano' value='"+value+"' /><span class='slider-container'></span></span>", options);

	var slider_container = element.querySelector(".slider-container");

	var slider = new LiteGUI.Slider(value,options);
	slider_container.appendChild(slider.root);

	var skip_change = false; //used to avoid recursive loops
	var text_input = element.querySelector(".slider-text");
	$(text_input).on('change', function() {
		if(skip_change) return;

		var v = parseFloat( $(this).val() );
		/*
		if(v > options.max)
		{
			skip_change = true;
			slider.setValue( options.max );
			skip_change = false;
		}
		else
		*/
		slider.setValue( v );

		Inspector.onWidgetChange.call(that,element,name,v, options);
	});

	$(slider.root).on("change", function(e,v) {
		text_input.value = v;
		Inspector.onWidgetChange.call(that,element,name,v, options);
	});

	
	/*
	//var element = this.createWidget(name,"<span class='inputfield'><input tabIndex='"+this.tab_index+"' type='text' class='fixed nano' value='"+value+"' /></span><div class='wslider'></div>", options);
	var element = this.createWidget(name,"<span class='inputfield'>\
				<input tabIndex='"+this.tab_index+"' type='text' class='slider-text fixed nano' value='"+value+"' /></span>\
				<span class='ui-slider'>\
				<input class='slider-input' type='range' step='"+options.step+"' min='"+ options.min +"' max='"+ options.max +"'/><span class='slider-thumb'></span></span>", options);

	this.tab_index++;

	var text_input = $(element).find(".slider-text");
	var slider_input = $(element).find(".slider-input");
	var slider_thumb = $(element).find(".slider-thumb");

	slider_input.bind('input', inner_slider_move );

	var skip_change = false; //used to avoid recursive loops
	text_input.bind('change', function() {
		if(skip_change) return;

		var v = parseFloat( $(this).val() );
		if(v > options.max)
		{
			skip_change = true;
			slider_input.val( options.max );
			skip_change = false;
		}
		else
			slider_input.val(v);

		var vnormalized = (v - options.min) / (options.max - options.min);
		if(vnormalized > 1) vnormalized = 1;
		else if(vnormalized < 0) vnormalized = 0;

		slider_thumb.css({left: (vnormalized * ($(slider_input).width() - 12)) });
		Inspector.onWidgetChange.call(that,element,name,v, options);
	});

	function inner_slider_move(e)
	{
		var v = parseFloat( e.target.value );
		var vnormalized = (v - options.min) / (options.max - options.min);
		if(!skip_change)
		{
			text_input.val(v);
			Inspector.onWidgetChange.call(that,element,name,v, options);
		}
		slider_thumb.css({left: (vnormalized * 90).toFixed(2) + "%" });
	}

	*/

	this.append(element,options);
	element.setValue = function(v) { slider.setValue(v); };
	//skip_change = true;
	//slider_input.val(value).trigger("input");
	//skip_change = false;
	return element;
}


Inspector.prototype.addCheckbox = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;

	var label_on = options.label_on || options.label || "on";
	var label_off = options.label_off || options.label || "off";
	var label = (value ? label_on : label_off);
	
	//var element = this.createWidget(name,"<span class='inputfield'><span class='fixed flag'>"+(value ? "on" : "off")+"</span><span tabIndex='"+this.tab_index+"'class='checkbox "+(value?"on":"")+"'></span></span>", options );
	var element = this.createWidget(name,"<span class='inputfield'><span tabIndex='"+this.tab_index+"' class='fixed flag checkbox "+(value ? "on" : "off")+"'>"+label+"</span></span>", options );
	this.tab_index++;

	var checkbox = element.querySelector(".wcontent .checkbox");
	checkbox.addEventListener("keypress", function(e) { 
		if(e.keyCode == 32)
			LiteGUI.trigger(this, "click");
	});

	element.addEventListener("click", function() {
		var v = !this.data;
		this.data = v;
		element.querySelector("span.flag").innerHTML = v ? label_on : label_off;
		if(v)
			checkbox.classList.add("on");
		else
			checkbox.classList.remove("on");
		Inspector.onWidgetChange.call(that,element,name,v, options);
	});
	
	element.data = value;

	element.setValue = function(v) { 
		if(	that.values[name] != v)
			LiteGUI.trigger( checkbox, "click" ); 
	};

	this.append(element,options);
	return element;
}

Inspector.prototype.addFlags = function(flags, force_flags)
{
	var f = {};
	for(var i in flags)
		f[i] = flags[i];
	if(force_flags)
		for(var i in force_flags)
			if( typeof(f[i]) == "undefined" )
				f[i] = ( force_flags[i] ? true : false );

	for(var i in f)
	{
		this.addCheckbox(i, f[i], { callback: (function(j) {
			return function(v) { 
				flags[j] = v;
			}
		})(i)
		});
	}
}

Inspector.prototype.addCombo = function(name, value, options)
{
	options = this.processOptions(options);

	//value = value || "";
	var that = this;
	this.values[name] = value;
	
	var code = "<select tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+" class='"+(options.disabled?"disabled":"")+"'>";
	this.tab_index++;

	var element = this.createWidget(name,"<span class='inputfield full inputcombo "+(options.disabled?"disabled":"")+"'></span>", options);
	element.options = options;

	var values = options.values || [];

	if(options.values)
	{
		if (typeof(values) == "function")
			values = options.values();
		else
			values = options.values;
		if(values) 
			for(var i in values)
			{
				var item_value = values[i];
				code += "<option data-value='" + item_value + "' "+( item_value == value ? " selected":"")+">" + ( values.length ? item_value : i) + "</option>";
			}
	}
	code += "</select>";

	element.querySelector("span.inputcombo").innerHTML = code;

	$(element).find(".wcontent select").change( function(e) { 
		var value = e.target.value;
		if(values && values.constructor != Array)
			value = values[value];
		Inspector.onWidgetChange.call(that,element,name,value, options);
	});

	element.setValue = function(v) { 
		var select = element.querySelector("select");
		var items = select.querySelectorAll("option");
		var index = 0;
		for(var i in items)
		{
			var item = items[i];
			if(!item || !item.dataset) //weird bug
				continue;
			if( item.dataset["value"] == v )
			{
				select.selectedIndex = index;
				return;
			}
			index++;
		}
	};

	this.append(element,options);
	return element;
}

Inspector.prototype.addComboButtons = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var code = "";
	if(options.values)
		for(var i in options.values)
			code += "<button class='wcombobutton "+(value == options.values[i] ? "selected":"")+"' data-name='options.values[i]'>" + options.values[i] + "</button>";

	var element = this.createWidget(name,code, options);
	$(element).find(".wcontent button").click( function(e) { 

		var buttonname = e.target.innerHTML;
		that.values[name] = buttonname;

		$(element).find(".selected").removeClass("selected");
		$(this).addClass("selected");

		Inspector.onWidgetChange.call(that,element,name,buttonname, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addTags = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || [];
	var that = this;
	this.values[name] = value;
	
	var code = "<select>";
	if(options.values)
		for(var i in options.values)
			code += "<option>" + options.values[i] + "</option>";

	code += "</select><div class='wtagscontainer inputfield'></div>";

	var element = this.createWidget(name,"<span class='inputfield full'>"+code+"</span>", options);
	element.tags = {};

	//add default tags
	for(var i in options.value)
		inner_addtag(options.value[i]);

	//combo change
	$(element).find(".wcontent select").change( function(e) { 
		inner_addtag(e.target.value);
	});

	function inner_addtag(tagname)
	{
		if( element.tags[tagname] )
			return; //repeated tags no

		element.tags[tagname] = true;

		var tag = document.createElement("div");
		tag.data = tagname;
		tag.className = "wtag";
		tag.innerHTML = tagname+"<span class='close'>X</span>";

		tag.querySelector(".close").addEventListener("click", function(e) {
			var tagname = $(this).parent()[0].data;
			delete element.tags[tagname];
			$(this).parent().remove();
			$(element).trigger("wremoved", tagname );
			Inspector.onWidgetChange.call(that,element,name,element.tags, options);
		});

		element.querySelector(".wtagscontainer").appendChild(tag);

		that.values[name] = element.tags;
		if(options.callback) options.callback.call(element,element.tags); 
		$(element).trigger("wchange",element.tags);
		$(element).trigger("wadded",tagname);
		if(that.onchange) that.onchange(name, element.tags, element);
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.addList = function(name, values, options)
{
	options = this.processOptions(options);

	var that = this;
	
	var height = "";
	if(options.height)
		height = "style='height: "+options.height+"px; overflow: auto;'";

	var code = "<ul class='lite-list' "+height+" tabIndex='"+this.tab_index+"'><ul>";
	this.tab_index++;

	var element = this.createWidget(name,"<span class='inputfield full "+(options.disabled?"disabled":"")+"'>"+code+"</span>", options);

	$(element).find("ul").focus(function() {
		$(document).on("keypress",inner_key);
	});

	$(element).find("ul").blur(function() {
		$(document).off("keypress",inner_key);
	});

	function inner_key(e)
	{
		var selected = $(element).find("li.selected");
		if(!selected || !selected.length) return;

		if(e.keyCode == 40)
		{
			var next = selected.next();
			if(next && next.length)
				$(next[0]).click();
		}
		else if(e.keyCode == 38)
		{
			var prev = selected.prev();
			if(prev && prev.length)
				$(prev[0]).click();
		}
	}

	function inner_item_click(e) { 

		if(options.multiselection)
			$(this).toggleClass("selected");
		else
		{
			//batch action, jquery...
			$(element).find("li").removeClass("selected");
			$(this).addClass("selected");
		}

		var value = values[ this.dataset["pos"] ];
		//if(options.callback) options.callback.call(element,value); //done in onWidgetChange
		Inspector.onWidgetChange.call(that,element,name,value, options);
		$(element).trigger("wadded",value);
	}

	element.updateItems = function(new_values)
	{
		var code = "";
		values = new_values;
		if(values)
			for(var i in values)
			{
				var item_name = values[i]; //array

				var icon = "";
				if(	values[i].length == null ) //object
				{
					item_name = values[i].name ? values[i].name : i;
					if(values[i].icon)
						icon = "<img src='"+values[i].icon+"' class='icon' />";
				}

				code += "<li className='item-"+i+" "+(typeof(values[i]) == "object" && values[i].selected ? "selected":"") + "' data-name='"+item_name+"' data-pos='"+i+"'>" + icon + item_name + "</li>";
			}

		this.querySelector("ul").innerHTML = code;
		$(this).find(".wcontent li").click( inner_item_click );
	}

	element.removeItem = function(name)
	{
		var items = $(element).find(".wcontent li");
		for(var i = 0; i < items.length; i++)
		{
			if(items[i].dataset["name"] == name)
				LiteGUI.remove( items[i] );
		}
	}

	element.updateItems(values);
	this.append(element,options);

	element.getSelected = function()
	{
		var r = [];
		var selected = this.querySelectorAll("ul li.selected");
		for(var i = 0; i < selected.length; ++i)
			r.push( selected[i].dataset["name"] );
		return r;
	}

	element.getIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		return items[num];
	}

	element.selectIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if(i == num)
				item.classList.add("selected");
			else
				item.classList.remove("selected");
		}
		return items[num];
	}

	element.scrollToIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		var item = items[num];
		if(!item)
			return;
		this.scrollTop = item.offsetTop;
	}

	element.selectAll = function()
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if( item.classList.contains("selected") )
				continue;
			//$(item).click();
			LiteGUI.trigger( item, "click" );
		}
	}

	element.setValue = function(v)
	{
		this.updateItems(v);
	}

	if(options.height) 
		$(element).scroll(0);
	return element;
}

Inspector.prototype.addButton = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var c = "";
	if(name === null)
		c = "single";
	
	var element = this.createWidget(name,"<button class='"+c+"' tabIndex='"+ this.tab_index + "'>"+value+"</button>", options);
	this.tab_index++;
	var button = element.querySelector("button");
	button.addEventListener("click", function() {
		Inspector.onWidgetChange.call(that,element,name,this.innerHTML, options);
		LiteGUI.trigger( button, "wclick", value );
	});
	this.append(element,options);

	element.wclick = function(callback) { 
		if(!options.disabled)
			$(this).wclick(callback); 
	}
	return element;
}

Inspector.prototype.addButtons = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var code = "";
	var w = "calc("+(100/value.length).toFixed(3)+"% - "+Math.floor(16/value.length)+"px);";
	if(value && typeof(value) == "object")
	{
		for(var i in value)
		{
			code += "<button tabIndex='"+this.tab_index+"' style=' width:"+w+" width: -moz-"+w+" width: -webkit-calc("+(89/value.length).toFixed(3)+"%)'>"+value[i]+"</button>";
			this.tab_index++;
		}
	}
	var element = this.createWidget(name,code, options);
	var buttons = element.querySelectorAll("button");
	for(var i = 0; i < buttons.length; ++i)
	{
		var button = buttons[i];
		button.addEventListener("click", function() {
			Inspector.onWidgetChange.call(that,element,name,this.innerHTML, options);
			LiteGUI.trigger( element, "wclick",this.innerHTML );
		});
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.addIcon = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var img_url = options.image;
	var width = options.width || options.size || 20;
	var height = options.height || options.size || 20;

	var element = this.createWidget(name,"<span class='icon' "+(options.title ? "title='"+options.title+"'" : "" )+" tabIndex='"+ this.tab_index + "'></span>", options);
	this.tab_index++;
	var content = element.querySelector("span.wcontent");
	var icon = element.querySelector("span.icon");

	var x = options.x || 0;
	if(options.index)
		x = options.index * -width;
	var y = value ? height : 0;

	element.style.minWidth = element.style.width = (width) + "px";
	element.style.margin = "0 2px"; element.style.padding = "0";
	content.style.margin = "0"; content.style.padding = "0";

	icon.style.display = "inline-block"
	icon.style.cursor = "pointer";
	icon.style.width = width + "px";
	icon.style.height = height + "px";
	icon.style.backgroundImage = "url('"+img_url+"')";
	icon.style.backgroundPosition = x + "px " + y + "px";

	icon.addEventListener("mousedown", function(e) {
		e.preventDefault();
		value = !value;
		var ret = Inspector.onWidgetChange.call(that,element,name, value, options);
		LiteGUI.trigger( element, "wclick", value);

		if(ret !== undefined)
			value = ret;

		var y = value ? height : 0;
		icon.style.backgroundPosition = x + "px " + y + "px";

		if(options.toggle === false) //blink
			setTimeout( function(){ icon.style.backgroundPosition = x + "px 0px"; value = false; },200 );

	});
	this.append(element,options);

	element.setValue = function(v, skip_event ) { 
		value = v;
		var y = value ? height : 0;
		icon.style.backgroundPosition = x + "px " + y + "px";
		if(!skip_event)
			Inspector.onWidgetChange.call(that,element,name, value, options);
	};
	element.getValue = function() { return value; };

	return element;
}

Inspector.prototype.addColor = function(name,value,options)
{
	options = this.processOptions(options);

	value = value || [0.0,0.0,0.0];
	var that = this;
	this.values[name] = value;
	
	var code = "<input tabIndex='"+this.tab_index+"' id='colorpicker-"+name+"' class='color' value='"+(value[0]+","+value[1]+","+value[2])+"' "+(options.disabled?"disabled":"")+"/>";
	this.tab_index++;

	if(options.show_rgb)
		code += "<span class='rgb-color'>"+Inspector.parseColor(value)+"</span>";
	var element = this.createWidget(name,code, options);
	this.append(element,options); //add now or jscolor dont work

	//create jsColor 
	var input_element = $(element).find("input.color")[0];
	var myColor = new jscolor.color(input_element);
	myColor.pickerFaceColor = "#333";
	myColor.pickerBorderColor = "black";
	myColor.pickerInsetColor = "#222";
	myColor.rgb_intensity = 1.0;

	if(options.disabled) 
		myColor.pickerOnfocus = false; //this doesnt work

	if(typeof(value) != "string" && value.length && value.length > 2)
	{
		var intensity = 1.0;
		myColor.fromRGB(value[0]*intensity,value[1]*intensity,value[2]*intensity);
		myColor.rgb_intensity = intensity;
	}

	//update values in rgb format
	input_element.addEventListener("change", function(e) { 
		var rgbelement = element.querySelector(".rgb-color");
		if(rgbelement)
			rgbelement.innerHTML = LiteGUI.Inspector.parseColor(myColor.rgb);
	});

	myColor.onImmediateChange = function() 
	{
		var v = [ myColor.rgb[0] * myColor.rgb_intensity, myColor.rgb[1] * myColor.rgb_intensity, myColor.rgb[2] * myColor.rgb_intensity ];
		//Inspector.onWidgetChange.call(that,element,name,v, options);

		that.values[name] = v;
		if(options.callback)
			options.callback.call(element, v.concat(), "#" + myColor.toString(), myColor);
		$(element).trigger("wchange",[v.concat(), myColor.toString()]);
		if(that.onchange) that.onchange(name, v.concat(), element);
	}

	//alpha dragger
	options.step = options.step || 0.01;
	options.dragger_class = "nano";

	var dragger = new LiteGUI.Dragger(1, options);
	$(element).find('.wcontent').append(dragger.root);
	$(dragger.input).change(function()
	{
		var v = parseFloat($(this).val());
		myColor.rgb_intensity = v;
		if (myColor.onImmediateChange)
			myColor.onImmediateChange();
	});

	element.setValue = function(value) { 
		myColor.fromRGB(value[0],value[1],value[2]);
		$(dragger.input).change(); 
	};

	return element;
}

Inspector.prototype.addFile = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield full whidden'><span class='filename'>"+value+"</span><input type='file' size='100' class='file' value='"+value+"'/></span>", options);
	var input = element.querySelector(".wcontent input");
	input.addEventListener("change", function(e) { 
		if(!e.target.files.length)
		{
			$(element).find(".filename").html("");
			Inspector.onWidgetChange.call(that, element, name, null, options);
			return;
		}

		var url = null;
		if( options.generate_url )
			url = URL.createObjectURL( e.target.files[0] );
		var data = { url: url, filename: e.target.value, file: e.target.files[0], files: e.target.files };
		$(element).find(".filename").html( e.target.value );
		Inspector.onWidgetChange.call(that, element, name, data, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addLine = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='line-editor'></span>", options);

	var line_editor = new LiteGUI.LineEditor(value,options);
	$(element).find("span.line-editor").append(line_editor);

	$(line_editor).change( function(e) { 
		if(options.callback) options.callback.call(element,e.target.value);
		$(element).trigger("wchange",[e.target.value]);
		Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addTree = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = this.createWidget(name,"<div class='wtree inputfield full'></div>", options);
	
	var tree_root = $(element).find(".wtree")[0];
	if(options.height)
	{
		tree_root.style.height = typeof(options.height) == "number" ? options.height + "px" : options.height;
		tree_root.style.overflow = "auto";
	}

	var current = value;

	var tree = element.tree = new LiteGUI.Tree(null,value, options.tree_options);
	tree.onItemSelected = function(node, data) {
		if(options.callback)
			options.callback(node,data);
	};

	tree_root.appendChild(tree.root);

	element.setValue = function(v) { 
		tree.updateTree(v);
	};

	this.append(element,options);
	return element;
}

Inspector.prototype.addDataTree = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = this.createWidget(name,"<div class='wtree'></div>", options);
	
	var node = $(element).find(".wtree")[0];
	var current = value;

	inner_recursive(node,value);

	function inner_recursive(root_node, value)
	{
		for(var i in value)
		{
			var e = document.createElement("div");
			e.className = "treenode";
			if( typeof( value[i] ) == "object" )
			{
				e.innerHTML = "<span class='itemname'>" + i + "</span><span class='itemcontent'></span>";
				inner_recursive($(e).find(".itemcontent")[0], value[i] );
			}
			else
				e.innerHTML = "<span class='itemname'>" + i + "</span><span class='itemvalue'>" + value[i] + "</span>";
			root_node.appendChild(e);
		}
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.scrollTo = function( id )
{
	var element = this.root.querySelector("#" + id );
	if(!element)
		return;
	var top = this.root.offsetTop;
	var delta = element.offsetTop - top;
	this.root.parentNode.parentNode.scrollTop = delta;
}

/*
Inspector.prototype.addImageSlot = function(title, callback_drop, callback_set)
{
	var element = this.createElement("DIV");
	element.innerHTML = "<strong>"+title+"</strong><input class='text' type='text' value=''/><button class='load confirm_button'>Ok</button><div class='img-slot'>Drop img here</div>";
	this.append(element);

	var confirm_button = $(element).find(".confirm_button")[0];
	$(confirm_button).click(function() {
		var text = $(element).find(".text")[0];
		if(callback_set)
			callback_set( $(text).val() );
	});

	var slot = $(element).find(".img-slot")[0];

	slot.addEventListener("dragenter", onDragEnter, false);
	slot.addEventListener("dragexit", onDragExit, false);
	slot.addEventListener("dragover", onDragNull, false);
	slot.addEventListener("drop", onFileDrop, false);


	function onDragEnter(evt)
	{
		$(slot).addClass("highlight");
		evt.stopPropagation();
		evt.preventDefault();
	}

	function onDragExit(evt)
	{
		$(slot).removeClass("highlight");
		evt.stopPropagation();
		evt.preventDefault();
	}

	function onDragNull(evt)
	{
		evt.stopPropagation();
		evt.preventDefault();
	}

	function onFileDrop(evt)
	{
		$(slot).removeClass("highlight");
		evt.stopPropagation();
		evt.preventDefault();

		var files = evt.dataTransfer.files;
		var count = files.length;
		
		var file = files[0];
		if(file == null) return;

		var reader = new FileReader();
		var extension = file.name.substr( file.name.lastIndexOf(".") + 1).toLowerCase();

		reader.onload = function(e) {
			if(callback_drop)
				callback_drop(e, file);
		}

		var image_extensions = ["png","jpg"];
		if (image_extensions.indexOf(extension) != -1)
			reader.readAsDataURL(file);
		else
			reader.readAsArrayBuffer(file);
	}
}
*/


Inspector.prototype.processOptions = function(options)
{
	if(typeof(options) == "function")
		options = { callback: options };
	return options || {};
}

Inspector.parseColor = function(color)
{
	return "<span style='color: #FAA'>" + color[0].toFixed(2) + "</span>,<span style='color: #AFA'>" + color[1].toFixed(2) + "</span>,<span style='color: #AAF'>" + color[2].toFixed(2) + "</span>";
}

LiteGUI.Inspector = Inspector;