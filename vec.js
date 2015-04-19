

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
  render(global_model);
  return global_model;
}


// FIGURES

var figures = Immutable.Map({
  rect: Immutable.Map({
    render: function(fig, model) {
      var selected = model.get("selection"),
          className = selected.contains(fig) ? "figure selected" : "figure";
      return <rect className = { className }
                   width     = { fig.get("width")  }
                   height    = { fig.get("height") }
                   x         = { fig.get("x")      }
                   y         = { fig.get("y")      } />;
    },
    contains: function(fig, point) {
      return fig.get("x") <= point[0] &&
             fig.get("x") + fig.get("width") >= point[0] &&
             fig.get("y") <= point[1] &&
             fig.get("y") + fig.get("height") >= point[1];
    },
    from_bb: function(bb) {
      return Immutable.Map({
        type:   "rect",
        x:      Math.min(bb[0], bb[2]),
        y:      Math.min(bb[1], bb[3]),
        width:  Math.abs(bb[0] - bb[2]),
        height: Math.abs(bb[1] - bb[3])
      });
    }
  }),

  oval: Immutable.Map({
    render: function(fig, model) {
      var selected = model.get("selection"),
          className = selected.contains(fig) ? "figure selected" : "figure";
      return <ellipse className = { className }
                      cx        = { fig.get("cx") }
                      cy        = { fig.get("cy") }
                      rx        = { fig.get("rx") }
                      ry        = { fig.get("ry") } />;
    },
    contains: function(fig, point) {
      var x = point[0],
          y = point[1],
          cx = fig.get("cx"),
          cy = fig.get("cy"),
          rx = fig.get("rx"),
          ry = fig.get("ry");
      return (x-cx)*(x-cx)/(rx*rx) + (y-cy)*(y-cy)/(ry*ry) <= 1;
    },
    from_bb: function(bb) {
      return Immutable.Map({
        type: "oval",
        cx:   (bb[0] + bb[2])/2,
        cy:   (bb[1] + bb[3])/2,
        rx:   Math.abs(bb[0] - bb[2])/2,
        ry:   Math.abs(bb[1] - bb[3])/2
      });
    }
  }),

  line: Immutable.Map({
    render: function(fig, model) {
      var selected = model.get("selection"),
          className = selected.contains(fig) ? "figure selected" : "figure";
      return <line className = { className }
                   x1 = { fig.get("x1") }
                   y1 = { fig.get("y1") }
                   x2 = { fig.get("x2") }
                   y2 = { fig.get("y2") } />;
    },
    contains: function(fig, point) {
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
    },
    from_bb: function(bb) {
      return Immutable.Map({
        type: "line",
        x1: bb[0],
        y1: bb[1],
        x2: bb[2],
        y2: bb[3]
      });
    }
  }),
});

function Rect(x,y,w,h) {
  return figures.get("rect").get("from_bb")([x, y, x+w, y+h]);
}

function dispatch(fig, fn) {
  var fun = figures.get(fig.get("type")).get(fn);
  if (fun !== undefined) {
    var args = new Array(arguments.length-1);
    args[0] = fig;
    for (var i = 1; i < args.length; i++)
      args[i] = arguments[i+1];
    return fun.apply(null, args);
  }
}

// TOOLBAR

function fig_drag_fn(fig) {
  return function(model, bb, e) {
    var scene = model.get("figures");
    var instance = figures.get(fig).get("from_bb")(bb);
    return model.set("figures", scene.push(instance))
                .set("selection", Immutable.Set.of(instance));
  }
}

var tools = Immutable.Map({
  select: Immutable.Map({
            key: "V",
            toolbar_offset: 0,
            click: function(model, point, e) {
              var pred  = function(fig) { return dispatch(fig, "contains", point) },
                  fig   = model.get("figures").find(pred),
                  multi = e.shiftKey;
              if (fig !== undefined && multi)
                return model.set("selection", model.get("selection").add(fig));
              else if (fig !== undefined && !multi)
                return model.set("selection", Immutable.Set.of(fig));
              else if (fig === undefined && !multi)
                return model.set("selection", Immutable.Set.of());
              else
                return model;
            }
          }),
  rect:   Immutable.Map({ key: "R", toolbar_offset: 1, drag: fig_drag_fn("rect") }),
  oval:   Immutable.Map({ key: "O", toolbar_offset: 2, drag: fig_drag_fn("oval") }),
  line:   Immutable.Map({ key: "L", toolbar_offset: 3, drag: fig_drag_fn("line") })
});

var Tool = React.createClass({
  render: function() {
    var code = this.props.code,
        tool = tools.get(code),
        offset = 40 * tool.get("toolbar_offset");

    return <g className={code === this.props.tool ? "selected" : ""}
              transform={"translate(" + offset + ",0)"}
              onClick={ function(e){ update(["tool"], code); e.stopPropagation(); } }>
             <rect  x="0" y="0" width="40" height="40" />
             <text textAnchor="middle" x="20" y="27">{tool.get("key")}</text>
           </g>;
  }
});

var Toolbar = React.createClass({
  render: function() {
    var tool = this.props.tool;
    return <g id="toolbar" transform="translate(10,10)">
      <Tool code="select" tool={tool} />
      <Tool code="rect"   tool={tool} />
      <Tool code="oval"   tool={tool} />
      <Tool code="line"   tool={tool} />
    </g>
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
    var tool    = tools.get(global_model.get("tool")),
        on_drag = tool.get("drag");
    if (on_drag !== undefined) {
      var bb = [start[0], start[1], e.clientX, e.clientY];
      render(on_drag(global_model, bb, e));
    }
  }
}

function canvas_mouse_up(e) {
  var start = global_model.get("touch-start"),
      end   = global_model.get("touch-end"),
      tool  = tools.get(global_model.get("tool"));
  update_silent(["touch-start"], undefined);
  update_silent(["touch-end"], undefined);

  if (end !== undefined) {
    console.log("drag", start[0], start[1], "=>", e.clientX, e.clientY);
    var on_drag = tool.get("drag");
    if (on_drag !== undefined) {
      global_model = on_drag(global_model, [start[0], start[1], end[0], end[1]], e);
      render(global_model);
    }
  } else {
    console.log("click", e.clientX, e.clientY);
    var on_click = tool.get("click");
    if (on_click !== undefined) {
      global_model = on_click(global_model, start, e);
      render(global_model);
    }
  }
}

var Canvas = React.createClass({
  render: function() {
    var model = this.props.model;
    return <svg id="canvas"
                onMouseDown={ canvas_mouse_down }
                onMouseMove={ canvas_mouse_move }
                onMouseUp  ={ canvas_mouse_up }>
      <Toolbar tool={ model.get("tool") } />
      { model.get("figures").map(function(fig) { return dispatch(fig, "render", model); }) }
    </svg>;
  }
});

function render(model) {
  React.render(<Canvas model={model} />, document.body);
}

update(["figures"], Immutable.List.of(
  Rect(100, 100, 161.8, 100),
  Rect(180, 120, 100, 161),
  Rect(140, 300, 61.8, 100)
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

