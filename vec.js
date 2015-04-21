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

var empty_model = Immutable.Map({
                    tool: "select",
                    figures: Immutable.List.of(),
                    selection: Immutable.Set.of()
                  }),
    model_history = Immutable.List.of(empty_model),
    history_at = 0;

function global_model() {
  return model_history.get(history_at);
}

function push_history(model) {
  model_history = model_history.setSize(history_at+1).push(model);
  history_at++;
  var skip = model_history.size - 20;
  if (skip > 0) {
    history_at -= skip;
    model_history = model_history.skip(skip);
  }
  render_canvas();
}

function edit_model(model) {
  if (!Immutable.is(model.get("figures"), global_model().get("figures"))) {
    push_history(model);
  } else {
    model_history = model_history.set(history_at, model);
    render_canvas();
  }
  persist();
}

function undo() {
  if (history_at > 0) {
    history_at--;
    render_canvas();
    persist();
  }
}

function redo() {
  if (history_at < model_history.size-1) {
    history_at++;
    render_canvas();
    persist();
  }
}

function persist (argument) {
  localStorage.setItem("vec/world", JSON.stringify(world_to_js()));
}

function world_to_js() {
  var cache = Immutable.List.of(),
      obj_id = function (o) {
                 var idx = cache.indexOf(o);
                 if (idx === -1) {
                   cache = cache.push(o);
                   return cache.size - 1;
                 } else
                   return idx;
               },
      models = [];
  model_history.forEach(function(model, i) {
    models.push( { tool:      model.get("tool"),
                   selection: model.get("selection").map(obj_id).toArray(),
                   figures:   model.get("figures").map(obj_id).toArray() });
  });
  return { models: models,
           history_at: history_at,
           figures: cache.map(function(o) { return o.toJS(); }).toArray() };
}

function world_from_js(json) {
  var figures = Immutable.List(json.figures).map(Immutable.Map),
      get_fig = function(i) { return figures.get(i); },
      models  = Immutable.List(json.models).map(function(m) {
        return Immutable.Map({
          tool: m.tool,
          selection: Immutable.List(m.selection).map(get_fig),
          figures:   Immutable.List(m.figures).map(get_fig)
      })});
  model_history = models;
  history_at = json.history_at;
  render_canvas();
}

// FIGURES

defmulti("render_figure",  function(fig, model)  { return fig.get("type"); });
defmulti("inside_figure",  function(fig, point)  { return fig.get("type"); });
defmulti("inside_stroke",  function(fig, point)  { return fig.get("type"); });
defmulti("move_figure",    function(fig, delta)  { return fig.get("type"); });
defmulti("figure_from_bb", function(type, bb)    { return type; });

function find_selected(figures, point) {
  var by_stroke = figures.find(function(fig) { return inside_stroke(fig, point); });
  // if (by_stroke !== undefined)
    return by_stroke;
  // return figures.find(function(fig) { return inside_figure(fig, point); });
}

var selection_treshold = 8;

// RECT

defmethod("render_figure", "rect", function(fig, selected) {
  return React.createElement(
          "rect", 
          { className: selected ? "figure selected" : "figure",
            width:     fig.get("w"),
            height:    fig.get("h"),
            x:         fig.get("x"),
            y:         fig.get("y") });
});

defmethod("inside_figure", "rect", function(fig, point) {
  return fig.get("x")                <= point[0] &&
         fig.get("x") + fig.get("w") >= point[0] &&
         fig.get("y")                <= point[1] &&
         fig.get("y") + fig.get("h") >= point[1];
});

defmethod("inside_stroke", "rect", function(fig, point) {
  var x1 = fig.get("x"),
      y1 = fig.get("y"),
      x2 = fig.get("x") + fig.get("w"),
      y2 = fig.get("y") + fig.get("h"),
      x  = point[0],
      y  = point[1],
      t  = selection_treshold;

  return (  y1 - t <= y && y <= y2 + t &&
          ((x1 - t <= x && x <= x1 + t) ||
           (x2 - t <= x && x <= x2 + t))) || 
         (  x1 - t <= x && x <= x2 + t &&
          ((y1 - t <= y && y <= y1 + t) ||
           (y2 - t <= y && y <= y2 + t)));
});

defmethod("figure_from_bb", "rect", function(type, bb) {
  return Immutable.Map({
    type: "rect",
    x: Math.min(bb[0], bb[2]),
    y: Math.min(bb[1], bb[3]),
    w: Math.abs(bb[0] - bb[2]),
    h: Math.abs(bb[1] - bb[3])
  });
});

defmethod("move_figure", "rect", function(fig, delta) {
  return Immutable.Map({
    type: "rect",
    x: fig.get("x") + delta[0],
    y: fig.get("y") + delta[1],
    w: fig.get("w"),
    h: fig.get("h")
  });
});


// OVAL

defmethod("render_figure", "oval", function(fig, selected) {
  return React.createElement(
           "ellipse", 
           { className: selected ? "figure selected" : "figure",
             cx:        fig.get("cx"),
             cy:        fig.get("cy"),
             rx:        fig.get("rx"),
             ry:        fig.get("ry") });
});


function inside_ellipse(x, y, cx, cy, rx, ry) {
  return (x-cx)*(x-cx)/(rx*rx) + (y-cy)*(y-cy)/(ry*ry) <= 1;
}

defmethod("inside_figure", "oval", function(fig, point) {
  return inside_ellipse(point[0], point[1], fig.get("cx"), fig.get("cy"), fig.get("rx"), fig.get("ry"));
});


defmethod("inside_stroke", "oval", function(fig, point) {
  var x = point[0],
      y = point[1],
      cx = fig.get("cx"),
      cy = fig.get("cy"),
      rx = fig.get("rx"),
      ry = fig.get("ry"),
      t  = selection_treshold;
  return inside_ellipse(x, y, cx, cy, rx+t, ry+t) && (rx <= t || ry <= t || !inside_ellipse(x, y, cx, cy, rx-t, ry-t));
});



defmethod("figure_from_bb", "oval", function(type, bb) {
  return Immutable.Map({
    type: "oval",
    cx: (bb[0] + bb[2])/2,
    cy: (bb[1] + bb[3])/2,
    rx: Math.abs(bb[0] - bb[2])/2,
    ry: Math.abs(bb[1] - bb[3])/2
  });
});

defmethod("move_figure", "oval", function(fig, delta) {
  return Immutable.Map({
    type: "oval",
    cx: fig.get("cx") + delta[0],
    cy: fig.get("cy") + delta[1],
    rx: fig.get("rx"),
    ry: fig.get("ry")
  });
});


// LINE

defmethod("render_figure", "line", function(fig, selected) {
  return React.createElement("line",
          { className: selected ? "figure selected" : "figure",
            x1:        fig.get("x1"),
            y1:        fig.get("y1"),
            x2:        fig.get("x2"),
            y2:        fig.get("y2") });
});

defmethod("inside_stroke", "line", function(fig, point) {
  var x1 = fig.get("x1"),
      y1 = fig.get("y1"),
      x2 = fig.get("x2"),
      y2 = fig.get("y2"),
      x  = point[0],
      y  = point[1];

  if (Math.min(x1, x2) <= x &&
      Math.max(x1, x2) >= x &&
      Math.min(y1, y2) <= y &&
      Math.max(y1, y2) >= y)
    return Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) /
           Math.sqrt((y2-y1) * (y2-y1) + (x2 - x1) * (x2 - x1)) <= selection_treshold;
});

defmethod("figure_from_bb", "line", function(type, bb) {
  return Immutable.Map({ type: "line", x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3] });
});

defmethod("move_figure", "line", function(fig, delta) {
  return Immutable.Map({ 
    type: "line", 
    x1: fig.get("x1") + delta[0],
    y1: fig.get("y1") + delta[1],
    x2: fig.get("x2") + delta[0],
    y2: fig.get("y2") + delta[1]
  });
});


// TOOLBAR

var tool_keys = Immutable.List.of(
  ["select", "V"],
  ["rect",   "R"],
  ["oval",   "O"],
  ["line",   "L"]
);

defmulti("tool_on_click", function(tool, model, point, e) { return tool; });
defmulti("tool_on_drag",  function(tool, model, bb, e)    { return tool; });

defmethod("tool_on_click", "select",
  function(tool, model, point, e) {
    var fig       = find_selected(model.get("figures"), point),
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
  });

defmethod("tool_on_drag", "select",
  function(tool, model, bb, e) {
    var start     = [bb[0], bb[1]],
        delta     = [bb[2] - bb[0], bb[3] - bb[1]],
        selection = model.get("selection"),
        scene     = model.get("figures");

    if (find_selected(selection, start) === undefined) {
      var fig = find_selected(scene, start);
      if (fig !== undefined) {
        selection = Immutable.Set.of(fig);
        model = model.set("selection", selection);
      }
    }

    if (find_selected(selection, start) !== undefined) {
      return model
             .set("figures", scene.map(function(fig) {
               return selection.contains(fig) ? move_figure(fig, delta) : fig;
             }))
             .set("selection", selection.map(function(fig) { return move_figure(fig, delta); }));
    }
  });


function fig_drag_fn(tool, model, bb, e) {
  if (!(bb[0] === bb[2] && bb[1] === bb[3])) {
    var scene = model.get("figures");
    var instance = figure_from_bb(tool, bb);
    return model.set("figures", scene.push(instance))
                .set("selection", Immutable.Set.of(instance));
  }
}

defmethod("tool_on_drag", "rect", fig_drag_fn);
defmethod("tool_on_drag", "oval", fig_drag_fn);
defmethod("tool_on_drag", "line", fig_drag_fn);



var Tool = React.createClass({
  render: function() {
    var code     = this.props.code,
        shortcut = this.props.shortcut,
        offset   = 40 * this.props.offset;

    return React.createElement("g",
            { className: "tool_" + code + (code === this.props.tool ? " selected" : ""),
              transform: "translate(" + offset + ",0)",
              onClick:   function(e) {
                           edit_model(global_model().set("tool", code));
                           e.stopPropagation();
                         } },
            React.createElement("rect", {x: 0, y: 0, width: 40, height: 40}),
            React.createElement("text", {textAnchor: "middle", x: 20, y: 27}, shortcut));
  }
});

var Toolbar = React.createClass({
  render: function() {
    var tool = this.props.tool;
    return React.createElement("g",
            { id: "toolbar", transform: "translate(10,10)" },
            tool_keys.map(function(t, i) {
              return React.createElement(Tool, {code: t[0], shortcut: t[1], tool: tool, offset: i})
            }));
  }
});


// CANVAS

var click_pos, drag_pos;

function mouse_pos(e) {
  return [10 * Math.round(e.clientX / 10),
          10 * Math.round(e.clientY / 10)];
}

function canvas_mouse_down(e) {
  if (click_pos === undefined)
    click_pos = mouse_pos(e);
}

function canvas_mouse_move(e) {
  var pos = mouse_pos(e);
  if (click_pos !== undefined && (drag_pos !== undefined || click_pos[0] !== pos[0] || click_pos[1] !== pos[1])) {
    drag_pos = pos;
    var model     = global_model(),
        bb        = [click_pos[0], click_pos[1], drag_pos[0], drag_pos[1]],
        tool      = model.get("tool"),
        new_model = tool_on_drag(tool, model, bb, e);
    if (new_model !== undefined)
      render_canvas(new_model);
  }
}

function canvas_mouse_up(e) {
  var model = global_model(),
      tool  = model.get("tool");
  if (click_pos !== undefined) {
    if (drag_pos !== undefined) {
      var bb    = [click_pos[0], click_pos[1], drag_pos[0], drag_pos[1]],
          new_model = tool_on_drag(tool, model, bb, e);
      if (new_model !== undefined)
        edit_model(new_model);
    } else {
      var new_model = tool_on_click(tool, model, click_pos, e);
      if (new_model !== undefined)
        edit_model(new_model);
    }
  }
  click_pos = undefined;
  drag_pos  = undefined;
}

var Scene = React.createClass({
  render: function() {
    var figures   = this.props.figures,
        selection = this.props.selection,
        render    = function(fig) { return render_figure(fig, selection.contains(fig)); };
    return React.createElement("g", {}, figures.map(render));
  }
});

var History = React.createClass({
  render: function() {
    var at   = this.props.history_at,
      render = function(m, i) {
      return React.createElement("rect", { 
        className:   i === at ? "selected" : "",
        x:           i*14 + 10,
        y:           document.body.clientHeight-20,
        width:       12,
        height:      12,
        onClick:     function(e) { history_at = i; render_canvas(); },
        onMouseOver: function(e) { render_canvas(model_history.get(i)); },
        onMouseOut:  function(e) { render_canvas(); },
      });
    };
    return React.createElement("g", { id: "history" }, this.props.history.map(render));
  }
});

var Canvas = React.createClass({
  render: function() {
    var model = this.props.model;
    return React.createElement("svg",
             { id: "canvas" },
             React.createElement(Toolbar, { tool: model.get("tool") }),
             React.createElement(History, { history: model_history, history_at: history_at }),
             React.createElement(Scene,
               { figures:   model.get("figures"),
                 selection: model.get("selection") }));
  }
});

function render_canvas(model) {
  React.render(React.createElement(Canvas, { model: model || global_model() }), document.body);
}

var stored = localStorage.getItem("vec/world");

if (stored !== undefined) {
  world_from_js(JSON.parse(stored));
} else {
  Immutable.List.of(
    figure_from_bb("oval", [110, 115, 120, 125]),
    figure_from_bb("oval", [130, 115, 140, 125]),
    figure_from_bb("oval", [150, 115, 160, 125]),
    figure_from_bb("line", [100, 140, 170, 140]),
    figure_from_bb("line", [170, 140, 180, 110]),
    figure_from_bb("line", [180, 110, 280, 110]),
    figure_from_bb("line", [280, 110, 290, 140]),
    figure_from_bb("line", [290, 140, 600, 140]),
    figure_from_bb("line", [100, 180, 600, 180]),
    figure_from_bb("rect", [100, 100, 600, 400])
  ).forEach(function(fig) {
    edit_model(global_model().set("figures", global_model().get("figures").push(fig)));
  });
}

// KEYBOARD

document.addEventListener("keydown", function(e) {
  if (!e.ctrlKey && !e.shiftKey && !e.metaKey) {
    var tool = tool_keys.find(function(t) { return t[1].charCodeAt(0) === e.keyCode });
    if (tool !== undefined)
      edit_model(global_model().set("tool", tool[0]));
  }
  switch (e.keyCode) {
    case 27: // escape
      click_pos = undefined;
      drag_pos  = undefined;
      render_canvas();
      break;
    case 8:  // backspace
    case 46: // delete
      var model = global_model(),
          scene = model.get("figures"),
          selection = model.get("selection"),
          selected  = function(fig) { return selection.contains(fig); };
      edit_model(model.set("figures", scene.filterNot(selected)));
      e.preventDefault();
      break;
    case 90: // Z
      if (e.metaKey || e.ctrlKey) {
        if (e.shiftKey) redo(); else undo();
      }
      break;
  }
});
document.addEventListener("mousedown", canvas_mouse_down);
document.addEventListener("mousemove", canvas_mouse_move);
document.addEventListener("mouseup", canvas_mouse_up);

window.addEventListener("resize", function(e) { render_canvas() });


