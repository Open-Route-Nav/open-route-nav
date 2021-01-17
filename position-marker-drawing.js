var Point2d = function(x, y) {
  this.x = x || 0;
  this.y = y || 0;
}

Point2d.prototype.set = function(x, y) { 
  this.x = x;
  this.y = y;
};

Point2d.prototype.translate = function(p) { 
  this.x += p.x;
  this.y += p.y;
  return this;
};

//rotation around origin
Point2d.prototype.rotate = function(phi) {
  this.set(
    this.x*Math.cos(phi) - this.y*Math.sin(phi),
    this.x*Math.sin(phi) + this.y*Math.cos(phi)
  );
  return this;
};

function drawPolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y); 
  for (var i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(points[0].x, points[0].y);//  close the shape
  ctx.lineWidth = 1;
  ctx.fillStyle = "#00FF00";
  ctx.fill();
  ctx.stroke();
  ctx.closePath();
}

function rotatePolygon(polygonPoints, phi, pointAround) {
  var pointAroundInv= new Point2d(-pointAround.x, -pointAround.y);
  
  for (var i = 0; i < polygonPoints.length; i++) {
    polygonPoints[i].translate(pointAroundInv);//  translate to origin
    polygonPoints[i].rotate(phi);//  rotate
    polygonPoints[i].translate(pointAround);// translate back to it's original position
  }
}

export default {
  drawMarker(ctx, rotation) {
    ctx.clearRect(0, 0, 100, 100);
    var triPoints = [
      new Point2d(30, 10),
      new Point2d(50, 30),
      new Point2d(70, 10),
      new Point2d(50, 80),
    ];
    rotatePolygon(triPoints, rotation * (Math.PI / 180), new Point2d(50, 50));
    drawPolygon(ctx, triPoints);
  }
}