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


function atom(value) {
  return {value: value,
          listeners: []};
}

function add_watch(atom, cb) {
  atom.listeners.push(cb);
}

function reset(atom, value) {
  var old = atom.value;
  atom.value = value;
  for (var i = 0; i < atom.listeners.length; ++i) {
    atom.listeners[i](atom, old, value);
  }
}

var list = function() { return Immutable.List.of.apply(Immutable.List, arguments); },
    map  = function() { return Immutable.Map.apply(Immutable, arguments); },
    set  = function() { return Immutable.Set.of.apply(Immutable.Set, arguments); },
    eq   = function(a, b) { return Immutable.is(a,b); };

// MODEL

function new_world() {
  var empty_model = map({ tool:      "select",
                          figures:   list(),
                          selection: set() });
  return map({ history:   list(empty_model),
               at:        0,
               click_pos: undefined,
               drag_pos:  undefined,
               viewport:  current_viewport() });
}

var world_ref = atom(new_world());

function current_model(w) {
  var world = w || world_ref.value;
  return world.get("history").get(world.get("at"));
}

function push_history(model) {
  var history = world_ref.value.get("history"),
      at      = world_ref.value.get("at"),
      new_history = history.setSize(at+1).push(model),
      new_at  = at+1;
  
  var skip = new_history.size - 50;
  if (skip > 0) {
    new_at -= skip;
    new_history = new_history.skip(skip);
  }

  reset(world_ref, world_ref.value.set("history", new_history).set("at", new_at));
}


function edit_model(model) {
  if (!eq(model.get("figures"), current_model().get("figures"))) {
    push_history(model);
  } else {
    var world = world_ref.value;
    reset(world_ref, world.setIn(["history", world.get("at")], model));
  }
}

function undo() {
  var at = world_ref.value.get("at");
  if (at > 0)
    reset(world_ref, world_ref.value.set("at", at-1));
}

function redo() {
  var history = world_ref.value.get("history"),
      at      = world_ref.value.get("at");
  if (at < history.size-1)
    reset(world_ref, world_ref.value.set("at", at+1));
}

function persist(world) {
  localStorage.setItem("vec/world", JSON.stringify(world_to_js(world)));
}

function world_to_js(world) {
  var cache = list(),
      obj_id = function (o) {
                 var idx = cache.indexOf(o);
                 if (idx === -1) {
                   cache = cache.push(o);
                   return cache.size - 1;
                 } else
                   return idx;
               },
      history = [];
  world.get("history").forEach(function(model, i) {
    history.push({ tool:      model.get("tool"),
                   selection: model.get("selection").map(obj_id).toArray(),
                   figures:   model.get("figures").map(obj_id).toArray() });
  });
  return { history: history,
           at:      world.get("at"),
           figures: cache.map(function(o) { return o.toJS(); }).toArray() };
}

function world_from_js(json) {
  var figures = Immutable.List(json.figures).map(Immutable.Map),
      get_fig = function(i) { return figures.get(i); },
      history = Immutable.List(json.history).map(function(m) {
        return map({
          tool:      m.tool,
          selection: Immutable.List(m.selection).map(get_fig),
          figures:   Immutable.List(m.figures).map(get_fig)
      })});
  return new_world().set("history", history).set("at", json.at);
}

// FIGURES

defmulti("render_figure",  function(fig, selected, key) { return fig.get("type"); });
defmulti("inside_figure",  function(fig, point)         { return fig.get("type"); });
defmulti("inside_stroke",  function(fig, point)         { return fig.get("type"); });
defmulti("move_figure",    function(fig, delta)         { return fig.get("type"); });
defmulti("figure_from_bb", function(type, p1, p2)       { return type; });

function find_selected(figures, point) {
  var by_stroke = figures.find(function(fig) { return inside_stroke(fig, point); });
  // if (by_stroke !== undefined)
    return by_stroke;
  // return figures.find(function(fig) { return inside_figure(fig, point); });
}

var selection_treshold = 8;

// RECT

defmethod("render_figure", "rect", function(fig, selected, key) {
  return React.createElement(
          "rect", 
          { key: key,
            className: selected ? "figure selected" : "figure",
            width:     fig.get("w"),
            height:    fig.get("h"),
            x:         fig.get("x"),
            y:         fig.get("y") });
});

defmethod("inside_figure", "rect", function(fig, point) {
  return fig.get("x")                <= point.get("x") &&
         fig.get("x") + fig.get("w") >= point.get("x") &&
         fig.get("y")                <= point.get("y") &&
         fig.get("y") + fig.get("h") >= point.get("y");
});

defmethod("inside_stroke", "rect", function(fig, point) {
  var x1 = fig.get("x"),
      y1 = fig.get("y"),
      x2 = fig.get("x") + fig.get("w"),
      y2 = fig.get("y") + fig.get("h"),
      x  = point.get("x"),
      y  = point.get("y"),
      t  = selection_treshold;

  return (  y1 - t <= y && y <= y2 + t &&
          ((x1 - t <= x && x <= x1 + t) ||
           (x2 - t <= x && x <= x2 + t))) || 
         (  x1 - t <= x && x <= x2 + t &&
          ((y1 - t <= y && y <= y1 + t) ||
           (y2 - t <= y && y <= y2 + t)));
});

defmethod("figure_from_bb", "rect", function(type, p1, p2) {
  return map({
    type: "rect",
    x: Math.min(p1.get("x"), p2.get("x")),
    y: Math.min(p1.get("y"), p2.get("y")),
    w: Math.abs(p1.get("x") - p2.get("x")),
    h: Math.abs(p1.get("y") - p2.get("y"))
  });
});

defmethod("move_figure", "rect", function(fig, delta) {
  return map({
    type: "rect",
    x: fig.get("x") + delta.get("x"),
    y: fig.get("y") + delta.get("y"),
    w: fig.get("w"),
    h: fig.get("h")
  });
});


// OVAL

defmethod("render_figure", "oval", function(fig, selected, key) {
  return React.createElement(
           "ellipse", 
           { key: key,
             className: selected ? "figure selected" : "figure",
             cx:        fig.get("cx"),
             cy:        fig.get("cy"),
             rx:        fig.get("rx"),
             ry:        fig.get("ry") });
});


function inside_ellipse(x, y, cx, cy, rx, ry) {
  return (x-cx)*(x-cx)/(rx*rx) + (y-cy)*(y-cy)/(ry*ry) <= 1;
}

defmethod("inside_figure", "oval", function(fig, point) {
  return inside_ellipse(point.get("x"), point.get("y"), fig.get("cx"), fig.get("cy"), fig.get("rx"), fig.get("ry"));
});


defmethod("inside_stroke", "oval", function(fig, point) {
  var x = point.get("x"),
      y = point.get("y"),
      cx = fig.get("cx"),
      cy = fig.get("cy"),
      rx = fig.get("rx"),
      ry = fig.get("ry"),
      t  = selection_treshold;
  return inside_ellipse(x, y, cx, cy, rx+t, ry+t) && (rx <= t || ry <= t || !inside_ellipse(x, y, cx, cy, rx-t, ry-t));
});



defmethod("figure_from_bb", "oval", function(type, p1, p2) {
  return map({
    type: "oval",
    cx: (p1.get("x") + p2.get("x"))/2,
    cy: (p1.get("y") + p2.get("y"))/2,
    rx: Math.abs(p1.get("x") - p2.get("x"))/2,
    ry: Math.abs(p1.get("y") - p2.get("y"))/2
  });
});

defmethod("move_figure", "oval", function(fig, delta) {
  return map({
    type: "oval",
    cx: fig.get("cx") + delta.get("x"),
    cy: fig.get("cy") + delta.get("y"),
    rx: fig.get("rx"),
    ry: fig.get("ry")
  });
});


// LINE

defmethod("render_figure", "line", function(fig, selected, key) {
  return React.createElement("line",
          { key: key,
            className: selected ? "figure selected" : "figure",
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
      x  = point.get("x"),
      y  = point.get("y");

  if (Math.min(x1, x2) <= x &&
      Math.max(x1, x2) >= x &&
      Math.min(y1, y2) <= y &&
      Math.max(y1, y2) >= y)
    return Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) /
           Math.sqrt((y2-y1) * (y2-y1) + (x2 - x1) * (x2 - x1)) <= selection_treshold;
});

defmethod("figure_from_bb", "line", function(type, p1, p2) {
  return map({ type: "line", x1: p1.get("x"), y1: p1.get("y"), x2: p2.get("x"), y2: p2.get("y") });
});

defmethod("move_figure", "line", function(fig, delta) {
  return map({ 
    type: "line", 
    x1: fig.get("x1") + delta.get("x"),
    y1: fig.get("y1") + delta.get("y"),
    x2: fig.get("x2") + delta.get("x"),
    y2: fig.get("y2") + delta.get("y")
  });
});


// TOOLBAR

var tool_keys = list(
  ["select", "V"],
  ["rect",   "R"],
  ["oval",   "O"],
  ["line",   "L"]
);

defmulti("tool_on_click", function(tool, model, point, e)  { return tool; });
defmulti("tool_on_drag",  function(tool, model, p1, p2, e) { return tool; });

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
      return model.set("selection", set(fig));
    else if (fig === undefined && !multi)
      return model.set("selection", set());
  });

defmethod("tool_on_drag", "select",
  function(tool, model, p1, p2, e) {
    var delta     = map({x: p2.get("x") - p1.get("x"), y: p2.get("y") - p1.get("y")}),
        selection = model.get("selection"),
        scene     = model.get("figures");

    if (find_selected(selection, p1) === undefined) {
      var fig = find_selected(scene, p1);
      if (fig !== undefined) {
        selection = set(fig);
        model = model.set("selection", selection);
      }
    }

    if (find_selected(selection, p1) !== undefined) {
      document.body.style.cursor = "move";
      return model
             .set("figures", scene.map(function(fig) {
               return selection.contains(fig) ? move_figure(fig, delta) : fig;
             }))
             .set("selection", selection.map(function(fig) { return move_figure(fig, delta); }));
    }
  });


function fig_drag_fn(tool, model, p1, p2, e) {
  if (!eq(p1, p2)) {
    var scene = model.get("figures");
    var instance = figure_from_bb(tool, p1, p2);
    return model.set("figures", scene.push(instance))
                .set("selection", set(instance));
  }
}

defmethod("tool_on_drag", "rect", fig_drag_fn);
defmethod("tool_on_drag", "oval", fig_drag_fn);
defmethod("tool_on_drag", "line", fig_drag_fn);

var Tool = React.createClass({
  shouldComponentUpdate: function(next_props) {
    return should_update("    Tool_" + this.props.code, this.props, next_props, ["code", "shortcut", "offset", "selected"]);
  },
  render: function() {
    var code     = this.props.code,
        shortcut = this.props.shortcut,
        offset   = 40 * this.props.offset;

    return React.createElement("g",
            { className: "tool_" + code + (this.props.selected ? " selected" : ""),
              transform: "translate(" + offset + ",0)",
              onClick:   function(e) {
                           edit_model(current_model().set("tool", code));
                           e.stopPropagation();
                         } },
            React.createElement("rect", {x: 0, y: 0, width: 40, height: 40}),
            React.createElement("text", {textAnchor: "middle", x: 20, y: 27}, shortcut));
  }
});

var Toolbar = React.createClass({
  shouldComponentUpdate: function(next_props) {
    return should_update("  Toolbar", this.props, next_props, ["tool"]);
  },
  render: function() {
    var tool = this.props.tool;
    return React.createElement("g",
            { id: "toolbar", transform: "translate(10,10)" },
            tool_keys.map(function(t, i) {
              return React.createElement(Tool, {key: t[0], code: t[0], shortcut: t[1], selected: tool === t[0], offset: i})
            }));
  }
});


// CANVAS

function current_viewport() {
  return map({w: document.body.clientWidth, h: document.body.clientHeight});
}

function mouse_pos(e) {
  return map({x: 10 * Math.round(e.clientX / 10),
              y: 10 * Math.round(e.clientY / 10)});
}

function canvas_mouse_down(e) {
  if (world_ref.value.get("click_pos") === undefined)
    reset(world_ref, world_ref.value.set("click_pos", mouse_pos(e)));
}

function canvas_mouse_move(e) {
  var click_pos = world_ref.value.get("click_pos"),
      drag_pos  = world_ref.value.get("drag_pos"),
      pos       = mouse_pos(e);
  if (click_pos !== undefined && 
      (drag_pos !== undefined || !eq(click_pos, pos))) {
    reset(world_ref, world_ref.value.set("drag_pos", pos).set("drag_event", e));
  }
}

function canvas_mouse_up(e) {
  var model = current_model(),
      tool  = model.get("tool"),
      click_pos = world_ref.value.get("click_pos"),
      drag_pos  = world_ref.value.get("drag_pos"),
      pos       = mouse_pos(e);

  if (click_pos !== undefined) {
    if (drag_pos !== undefined) {
      var new_model = tool_on_drag(tool, model, click_pos, drag_pos, e);
      if (new_model !== undefined)
        edit_model(new_model);
    } else {
      var new_model = tool_on_click(tool, model, click_pos, e);
      if (new_model !== undefined)
        edit_model(new_model);
    }
  }
  document.body.style.cursor = "auto";
  reset(world_ref, world_ref.value.delete("click_pos").delete("drag_pos").delete("drag_event"));
}

function should_update(name, from, to, props) {
  for (var i = 0; i < props.length; ++i) {
    var prop = props[i];
    if (!eq(from[prop], to[prop])) {
      // console.log(name + "." + prop + " changed");
      return true;
    }
  };
  // console.log(name + " // skip");
  return false;
}

var Scene = React.createClass({
  shouldComponentUpdate: function(next_props) {
    return should_update("  Scene", this.props, next_props, ["figures", "selection"]);
  },
  render: function() {
    var figures   = this.props.figures,
        selection = this.props.selection,
        render    = function(fig, i) { return render_figure(fig, selection.contains(fig), i); };
    return React.createElement("g", {}, figures.map(render));
  }
});

var History = React.createClass({
  shouldComponentUpdate: function(next_props) {
    return should_update("  History", this.props, next_props, ["history", "at", "viewport"]);
  },
  render: function() {
    var history  = this.props.history,
        at       = this.props.at,
        viewport = this.props.viewport,
        render   = function(m, i) {
                     return React.createElement("rect", {
                       key:         i,
                       className:   i === at ? "selected" : "",
                       x:           i*14 + 10,
                       y:           viewport.get("h") - 20,
                       width:       12,
                       height:      12,
                       onClick:     function(e) { at = i; render_canvas(); },
                       onMouseOver: function(e) { render_canvas(history.get(i)); },
                       onMouseOut:  function(e) { render_canvas(); },
                     });
                   };
    return React.createElement("g", { id: "history" }, this.props.history.map(render));
  }
});

var UI = React.createClass({
  shouldComponentUpdate: function(next_props) {
    return should_update("Canvas", this.props, next_props, ["world"]);
  },
  render: function() {
    var world     = this.props.world,
        model     = current_model(world),
        click_pos = world.get("click_pos"),
        drag_pos  = world.get("drag_pos");
    if (drag_pos !== undefined) {
      var new_model = tool_on_drag(model.get("tool"), model, click_pos, drag_pos, world.get("drag_event"));
      if (new_model !== undefined)
        model = new_model;
    }
    return React.createElement("svg",
             { id: "canvas" },
             React.createElement(Toolbar, { tool:     model.get("tool") }),
             React.createElement(History, { history:  world.get("history"), 
                                            at:       world.get("at"),
                                            viewport: world.get("viewport") }),
             React.createElement(Scene,
               { figures:   model.get("figures"),
                 selection: model.get("selection") }));
  }
});

function render_ui(world) {
  React.render(React.createElement(UI, { world: world }), document.body);
}

add_watch(world_ref, function(world, old, _new) { render_ui(_new); });
add_watch(world_ref, function(world, old, _new) { persist(_new); });

var stored = localStorage.getItem("vec/world");

if (stored !== null) {
  reset(world_ref, world_from_js(JSON.parse(stored)));
} else {
  list(
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
    edit_model(current_model().set("figures", current_model().get("figures").push(fig)));
  });
}

// KEYBOARD

document.addEventListener("keydown", function(e) {
  if (!e.ctrlKey && !e.shiftKey && !e.metaKey) {
    var tool = tool_keys.find(function(t) { return t[1].charCodeAt(0) === e.keyCode });
    if (tool !== undefined)
      edit_model(current_model().set("tool", tool[0]));
  }
  switch (e.keyCode) {
    case 27: // escape
      reset(world_ref, world_ref.value.delete("click_pos").delete("drag_pos"));
      break;
    case 8:  // backspace
    case 46: // delete
      var model = current_model(),
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
window.addEventListener("resize", function(e) { 
  reset(world_ref, world_ref.value.set("viewport", current_viewport()));
} );


