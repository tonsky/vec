// UTILS

function defmulti(name, dispatch_fn) {
  var dispatch_table_name = "_" + name + "_mm";
  window[dispatch_table_name] = {};
  window[name] = function() {
    var fun = window[dispatch_table_name][dispatch_fn.apply(null, arguments)];
    if (fun !== undefined)
      return fun.apply(null, arguments);
  }
}

function defmethod(name, dispatch_value, fn) {
  window["_" + name + "_mm"][dispatch_value] = fn;
}


// MODEL

var global_model = Immutable.Map({
  tool: "select",
  figures: Immutable.List.of(),
  selection: Immutable.Set.of()
});

function update_silent(path, value) {
  global_model = global_model.setIn(path, value);
  return global_model;
}

function update(path, value) {
  update_silent(path, value);
  render_canvas(global_model);
  return global_model;
}


// FIGURES

defmulti("render_figure",  function(fig, model) { return fig.get("type"); });
defmulti("inside_figure",  function(fig, point) { return fig.get("type"); });
defmulti("figure_from_bb", function(type, bb)   { return type; });

// RECT

defmethod("render_figure", "rect", function(fig, model) {
  var selected = model.get("selection"),
      className = selected.contains(fig) ? "figure selected" : "figure";
  return React.createElement(
          "rect", 
          { className: className,
            width:  fig.get("width"),
            height: fig.get("height"),
            x:      fig.get("x"),
            y:      fig.get("y") });
});

defmethod("inside_figure", "rect", function(fig, point) {
  return fig.get("x") <= point[0] &&
         fig.get("x") + fig.get("width") >= point[0] &&
         fig.get("y") <= point[1] &&
         fig.get("y") + fig.get("height") >= point[1];
});

defmethod("figure_from_bb", "rect", function(type, bb) {
  return Immutable.Map({
    type:   "rect",
    x:      Math.min(bb[0], bb[2]),
    y:      Math.min(bb[1], bb[3]),
    width:  Math.abs(bb[0] - bb[2]),
    height: Math.abs(bb[1] - bb[3])
  });
});


// OVAL

defmethod("render_figure", "oval", function(fig, model) {
  var selected = model.get("selection"),
      className = selected.contains(fig) ? "figure selected" : "figure";
  return React.createElement(
           "ellipse", 
           { className: className,
             cx:        fig.get("cx"),
             cy:        fig.get("cy"),
             rx:        fig.get("rx"),
             ry:        fig.get("ry") });
});

defmethod("inside_figure", "oval", function(fig, point) {
  var x = point[0],
      y = point[1],
      cx = fig.get("cx"),
      cy = fig.get("cy"),
      rx = fig.get("rx"),
      ry = fig.get("ry");
  return (x-cx)*(x-cx)/(rx*rx) + (y-cy)*(y-cy)/(ry*ry) <= 1;
});

defmethod("figure_from_bb", "oval", function(type, bb) {
  return Immutable.Map({
    type: "oval",
    cx:   (bb[0] + bb[2])/2,
    cy:   (bb[1] + bb[3])/2,
    rx:   Math.abs(bb[0] - bb[2])/2,
    ry:   Math.abs(bb[1] - bb[3])/2
  });
});


// LINE

defmethod("render_figure", "line", function(fig, model) {
  var selected = model.get("selection"),
      className = selected.contains(fig) ? "figure selected" : "figure";
  return React.createElement("line",
          { className: className,
            x1: fig.get("x1"),
            y1: fig.get("y1"),
            x2: fig.get("x2"),
            y2: fig.get("y2") });
});

defmethod("inside_figure", "line", function(fig, point) {
  var x1 = fig.get("x1"),
      y1 = fig.get("y1"),
      x2 = fig.get("x2"),
      y2 = fig.get("y2"),
      x  = point[0],
      y  = point[1],
      d  = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) /
           Math.sqrt((y2-y1) * (y2-y1) + (x2 - x1) * (x2 - x1));

  return Math.min(x1, x2) <= x &&
         Math.max(x1, x2) >= x &&
         Math.min(y1, y2) <= y &&
         Math.max(y1, y2) >= y &&
         d <= 10;
});

defmethod("figure_from_bb", "line", function(type, bb) {
  return Immutable.Map({
    type: "line",
    x1: bb[0],
    y1: bb[1],
    x2: bb[2],
    y2: bb[3]
  });
});


// TOOLBAR

var tools = Immutable.Map({
  select: Immutable.Map({ key: "V", toolbar_offset: 0 }),
  rect:   Immutable.Map({ key: "R", toolbar_offset: 1 }),
  oval:   Immutable.Map({ key: "O", toolbar_offset: 2 }),
  line:   Immutable.Map({ key: "L", toolbar_offset: 3 })
});


defmulti("tool_on_click", function(tool, model, point, e) { return tool; });
defmulti("tool_on_drag", function(tool, model, bb, e) { return tool; });

defmethod("tool_on_click", "select", function(tool, model, point, e) {
  var pred      = function(fig) { return inside_figure(fig, point) },
      fig       = model.get("figures").find(pred),
      multi     = e.shiftKey,
      selection = model.get("selection");
  if (fig !== undefined && multi && selection.contains(fig))
    return model.set("selection", selection.delete(fig));
  else if (fig !== undefined && multi && !selection.contains(fig))
    return model.set("selection", selection.add(fig));
  else if (fig !== undefined && !multi)
    return model.set("selection", Immutable.Set.of(fig));
  else if (fig === undefined && !multi)
    return model.set("selection", Immutable.Set.of());
  else
    return model;
});

function fig_drag_fn(tool, model, bb, e) {
    var scene = model.get("figures");
    var instance = figure_from_bb(tool, bb);
    return model.set("figures", scene.push(instance))
                .set("selection", Immutable.Set.of(instance));
}

defmethod("tool_on_drag", "rect", fig_drag_fn);
defmethod("tool_on_drag", "oval", fig_drag_fn);
defmethod("tool_on_drag", "line", fig_drag_fn);



var Tool = React.createClass({
  render: function() {
    var code = this.props.code,
        tool = tools.get(code),
        offset = 40 * tool.get("toolbar_offset");

    return React.createElement("g",
            { className: code === this.props.tool ? "selected" : "",
              transform: "translate(" + offset + ",0)",
              onClick:   function(e){ update(["tool"], code); e.stopPropagation(); } },
            React.createElement("rect", {x: 0, y: 0, width: 40, height: 40}),
            React.createElement("text", {textAnchor: "middle", x: 20, y: 27}, tool.get("key")));
  }
});

var Toolbar = React.createClass({
  render: function() {
    var tool = this.props.tool;
    return React.createElement("g", {id: "toolbar", transform: "translate(10,10)"},
        React.createElement(Tool, {code: "select", tool: tool}),
        React.createElement(Tool, {code: "rect",   tool: tool}),
        React.createElement(Tool, {code: "oval",   tool: tool}),
        React.createElement(Tool, {code: "line",   tool: tool}));
  }
});


// CANVAS

function canvas_mouse_down(e) {
  if (global_model.get("touch-start") === undefined)
    update_silent(["touch-start"], [e.clientX, e.clientY]);
}

function canvas_mouse_move(e) {
  var start = global_model.get("touch-start");
  if (start !== undefined && (start[0] !== e.clientX || start[1] !== e.clientY)) {
    update_silent(["touch-end"], [e.clientX, e.clientY]);
    var bb    = [start[0], start[1], e.clientX, e.clientY],
        tool  = global_model.get("tool"),
        model = tool_on_drag(tool, global_model, bb, e);
    if (model !== undefined)
      render_canvas(model);
  }
}

function canvas_mouse_up(e) {
  var start = global_model.get("touch-start"),
      end   = global_model.get("touch-end"),
      tool  = global_model.get("tool");
  update_silent(["touch-start"], undefined);
  update_silent(["touch-end"], undefined);

  if (end !== undefined) {
    var bb    = [start[0], start[1], e.clientX, e.clientY],
        model = tool_on_drag(tool, global_model, bb, e);
    if (model !== undefined) {
      global_model = model;
      render_canvas(global_model);
    }
  } else {
    var model = tool_on_click(tool, global_model, start, e);
    if (model !== undefined) {
      global_model = model;
      render_canvas(global_model);
    }
  }
}

var Canvas = React.createClass({
  render: function() {
    var model = this.props.model,
        scene = model.get("figures"),
        children = scene.map(function(fig) { return render_figure(fig, model); });
    return React.createElement("svg", 
             { id: "canvas",
               onMouseDown: canvas_mouse_down,
               onMouseMove: canvas_mouse_move,
               onMouseUp  : canvas_mouse_up },
             React.createElement(Toolbar, { tool: model.get("tool") }),
             children);
  }
});

function render_canvas(model) {
  React.render(React.createElement(Canvas, { model: model }), document.body);
}

update(["figures"], Immutable.List.of(
  figure_from_bb("rect", [100, 100, 261.8, 200]),
  figure_from_bb("rect", [180, 120, 280, 281]),
  figure_from_bb("rect", [140, 300, 201.8, 400])
));


// KEYBOARD

function find_map_entry(map, pred){
  return Immutable.Iterable(map.entries()).find(function(v) { return pred(v[0], v[1]); });
}

document.addEventListener("keydown", function(e) {
  var tool = find_map_entry(tools, function(code,tool) {
                                     return tool.get("key").charCodeAt(0) == e.keyCode });
  if (tool !== undefined)
    update(["tool"], tool[0]);
  switch (e.keyCode) {
    case 27: // escape
      update_silent(["touch-start"], undefined);
      update(["touch-end"], undefined);
      break;
    case 8:  // backspace
    case 46: // delete
      var scene = global_model.get("figures"),
          selection = global_model.get("selection");
      update(["figures"], scene.filterNot(function(fig) { return selection.contains(fig); }));
      e.preventDefault();
      break;
  }
});

