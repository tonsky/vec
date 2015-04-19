// FIGURES

var figures = Immutable.Map({
  rect: Immutable.Map({
    render: function(rect) {
      return <rect className="figure"
                   width  = {rect.get("width")}
                   height = {rect.get("height")}
                   x      = {rect.get("x")}
                   y      = {rect.get("y")} />;
    }})
});

function Rect(x,y,w,h) {
  return Immutable.Map({type:"rect", x:x, y:y, width:w, height: h});
}

function render_figure(fig) {
  return figures.get(fig.get("type")).get("render")(fig);
}


// MODEL

var model = Immutable.Map({
  tool: "select",
  figures: Immutable.List.of(Rect(100, 100, 161.8, 100))
});

function update(path, value) {
  model = model.setIn(path, value);
  render(model);
}


// TOOLBAR

var tools = Immutable.Map({
  select: Immutable.Map({key: "V", toolbar_offset: 0, keyCode: 86}),
  rect:   Immutable.Map({key: "R", toolbar_offset: 1, keyCode: 82}),
  oval:   Immutable.Map({key: "O", toolbar_offset: 2, keyCode: 79}),
  line:   Immutable.Map({key: "L", toolbar_offset: 3, keyCode: 76})
});

var Tool = React.createClass({
  render: function() {
    var code = this.props.code,
        tool = tools.get(code),
        offset = 40 * tool.get("toolbar_offset");

    return <g className={code === this.props.tool ? "selected" : ""}
              transform={"translate(" + offset + ",0)"}
              onClick={ function(){ update(["tool"], code); } }>
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

var Canvas = React.createClass({
  render: function() {
    return <svg id="canvas">
      <Toolbar tool={this.props.model.get("tool")} />
      {this.props.model.get("figures").map(render_figure)}
    </svg>;
  }
});

function render(model) {
  React.render(<Canvas model={model} />, document.body);
}

render(model);


// KEYBOARD

document.addEventListener("keydown", function(e) {
  var tool = Immutable.Iterable(tools.entries()).find(function(v) { return v[1].get("keyCode") == e.keyCode });
  if (tool !== undefined) {
    update(["tool"], tool[0]);
  }
});

