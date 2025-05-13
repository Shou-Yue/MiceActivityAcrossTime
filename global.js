const margin = { top: 20, right: 60, bottom: 60, left: 60 },
      W=900-margin.left-margin.right,
      H=460-margin.top-margin.bottom;

const svg=d3.select('#chart')
  .append('svg')
  .attr('viewBox',`0 0 ${W+margin.left+margin.right} ${H+margin.top+margin.bottom}`);

const g=svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

g.append('defs')
 .append('clipPath')
 .attr('id','clip')
 .append('rect')
 .attr('width',W)
 .attr('height',H);

const plot=g.append('g').attr('clip-path','url(#clip)');

plot.append('g').attr('class','back-lightdark');
plot.append('g').attr('class','ovulation-lines');
plot.append('path').attr('class','lineA');
plot.append('path').attr('class','lineB');

g.append('g').attr('class','axis x');
g.append('g').attr('class','axis y');

const legend = g.append('g')
  .attr('class', 'legend')
  .attr('transform', `translate(0, ${H + 35})`);


legend.append('line').attr('class','lineA').attr('x1',0).attr('x2',20).attr('y1',0).attr('y2',0);
legend.append('text').attr('x',25).attr('y',4).text('Trend A');
legend.append('line').attr('class','lineB').attr('x1',90).attr('x2',110).attr('y1',0).attr('y2',0);
legend.append('text').attr('x',115).attr('y',4).text('Trend B');
legend.append('rect').attr('class','dark-rect legendBox').attr('x',190).attr('y',-5);
legend.append('text').attr('x',205).attr('y',4).text('Lights off');
legend.append('rect').attr('class','light-rect legendBox').attr('x',270).attr('y',-5);
legend.append('text').attr('x',285).attr('y',4).text('Lights on');
legend.append('line').attr('class','ovuline').attr('x1',355).attr('x2',375).attr('y1',0).attr('y2',0);
legend.append('text').attr('x',380).attr('y',4).text('Ovulation start');

const x=d3.scaleLinear().range([0,W]),
      y=d3.scaleLinear().range([H,0]);

Promise.all([
  d3.csv('data/Mouse_Fem_Act.csv'),
  d3.csv('data/Mouse_Fem_Temp.csv'),
  d3.csv('data/Mouse_Male_Act.csv'),
  d3.csv('data/Mouse_Male_Temp.csv')
]).then(raw=>init(wrangle(raw)));

function wrangle([fA,fT,mA,mT]){
  const minPerDay=1440,bin=20,totalBins=fA.length/bin;
  const agg=r=>{
    const ids=r.columns,o={},c=Array(totalBins).fill(0);
    ids.forEach(id=>o[id]=Array(totalBins).fill(0));
    r.forEach((row,i)=>{const b=Math.floor(i/bin);ids.forEach(id=>o[id][b]+=+row[id]);c[b]++});
    ids.forEach(id=>o[id]=o[id].map((v,b)=>v/c[b]));
    return o};
  const fAct=agg(fA),fTmp=agg(fT),mAct=agg(mA),mTmp=agg(mT);
  const merge=(a,t)=>{const o={};Object.keys(a).forEach(id=>{
    o[id]=a[id].map((_,i)=>({minute:i*bin,activity:a[id][i],temp:t[id][i]}))});return o};
  const Fem=merge(fAct,fTmp),Male=merge(mAct,mTmp);
  const avg=g=>{const k=Object.keys(g);return g[k[0]].map((p,i)=>({
    minute:p.minute,
    activity:d3.mean(k,s=>g[s][i].activity),
    temp:d3.mean(k,s=>g[s][i].temp)}))};
  const female_avg=avg(Fem),male_avg=avg(Male);
  const all_avg=female_avg.map((p,i)=>({minute:p.minute,
    activity:.5*(female_avg[i].activity+male_avg[i].activity),
    temp:.5*(female_avg[i].temp+male_avg[i].temp)}));
  return{Fem,Male,derived:{female_avg,male_avg,all_avg},meta:{minPerDay,bin,totalBins}};
}

function init(data){
  const ids=[...Object.keys(data.Fem),...Object.keys(data.Male)].sort();
  const opts=[{val:'all_avg',txt:'All Avg'},{val:'male_avg',txt:'Male Avg'},
    {val:'female_avg',txt:'Female Avg'},...ids.map(id=>({val:id,txt:id}))];
  d3.selectAll('#trendA,#trendB').selectAll('option').data(opts).enter()
    .append('option').attr('value',d=>d.val).text(d=>d.txt);
  d3.select('#trendA').property('value','male_avg');
  d3.select('#trendB').property('value','female_avg');

  const startSel=d3.select('#startDay'),
        endSel=d3.select('#endDay'),
        metricSel=d3.select('#metricSelect'),
        trendA=d3.select('#trendA'),
        trendB=d3.select('#trendB');

  const totalDays=data.meta.totalBins*data.meta.bin/data.meta.minPerDay;
  for(let d=1;d<=totalDays;d++){
    startSel.append('option').attr('value',d).text(d);
    endSel.append('option').attr('value',d).text(d);
  }
  startSel.property('value',1);
  endSel.property('value',7);

  x.domain([0,data.meta.totalBins*data.meta.bin]);

  drawBackground(data.meta);

  const line=d3.line().x(d=>x(d.minute));

  const getSeries=code=>code==='male_avg'?data.derived.male_avg:
    code==='female_avg'?data.derived.female_avg:
    code==='all_avg'?data.derived.all_avg:
    data.Fem[code]||data.Male[code];

  const zoom=d3.zoom().scaleExtent([1,30]).translateExtent([[0,0],[W,H]]).on('zoom',ev=>{
    const zx=ev.transform.rescaleX(x),metric=metricSel.node().value;
    const lineZ=d3.line().x(d=>zx(d.minute)).y(d=>y(d[metric]));
    plot.select('.lineA').attr('d',lineZ);
    plot.select('.lineB').attr('d',lineZ);
    g.select('.axis.x').call(d3.axisBottom(zx).ticks(8).tickFormat(minTo));
    plot.selectAll('.back-lightdark rect')
      .attr('x',d=>zx(d[0])).attr('width',d=>zx(d[1])-zx(d[0]));
    plot.selectAll('.ovulation-lines line')
      .attr('x1',d=>zx(d)).attr('x2',d=>zx(d));
  });

  svg.call(zoom);

  function update(reset=false){
    let d0=+startSel.node().value,d1=+endSel.node().value;
    if(d0>d1){[d0,d1]=[d1,d0];startSel.property('value',d0);endSel.property('value',d1)}
    x.domain([(d0-1)*data.meta.minPerDay,d1*data.meta.minPerDay]);
    if(reset)svg.call(zoom.transform,d3.zoomIdentity);
    const metric=metricSel.node().value,
          serA=getSeries(trendA.node().value),
          serB=getSeries(trendB.node().value);
    if(metric==='temp'){
      const lo=d3.min([d3.min(serA,d=>d.temp),d3.min(serB,d=>d.temp)]),
            hi=d3.max([d3.max(serA,d=>d.temp),d3.max(serB,d=>d.temp)]);
      y.domain([lo-.5,hi+.5]);
    }else{
      const hi=d3.max([d3.max(serA,d=>d.activity),d3.max(serB,d=>d.activity)]);
      y.domain([0,hi*1.05]);
    }
    line.y(d=>y(d[metric]));
    plot.select('.lineA').datum(serA).attr('d',line);
    plot.select('.lineB').datum(serB).attr('d',line);
    g.select('.axis.x')
      .attr('transform',`translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(Math.max(4,(d1-d0+1)*2)).tickFormat(minTo));
    g.select('.axis.y').call(
      metric==='temp'?d3.axisLeft(y).ticks(6).tickFormat(d=>`${d} °C`):d3.axisLeft(y));
    plot.selectAll('.back-lightdark rect')
      .attr('x',d=>x(d[0])).attr('width',d=>x(d[1])-x(d[0]));
    plot.selectAll('.ovulation-lines line')
      .attr('x1',d=>x(d)).attr('x2',d=>x(d));
  }

  trendA.on('change',()=>update());
  trendB.on('change',()=>update());
  metricSel.on('change',()=>update());
  startSel.on('change',()=>update(true));
  endSel.on('change',()=>update(true));

  d3.select('#resetBtn').on('click',()=>{
    metricSel.property('value','activity');
    trendA.property('value','male_avg');
    trendB.property('value','female_avg');
    startSel.property('value',1);
    endSel.property('value',7);
    update(true);
  });

  update();
}

function drawBackground(meta){
  const {minPerDay,bin,totalBins}=meta;
  const ld=[];for(let m=0;m<totalBins*bin;m+=minPerDay){
    ld.push([m,m+720,'dark']);ld.push([m+720,m+1440,'light']);}
  plot.select('.back-lightdark').selectAll('rect')
    .data(ld).enter().append('rect')
    .attr('class',d=>d[2]==='dark'?'dark-rect':'light-rect')
    .attr('y',0).attr('height',H)
    .attr('x',d=>x(d[0])).attr('width',d=>x(d[1])-x(d[0]));
  const ov=d3.range(2,ld.length/2,4).map(d=>d*minPerDay);
  plot.select('.ovulation-lines').selectAll('line')
    .data(ov).enter().append('line')
    .attr('class','ovuline')
    .attr('y1',0).attr('y2',H)
    .attr('x1',d=>x(d)).attr('x2',d=>x(d));
}

function minTo(m){const h=Math.floor(m/60)%24,d=Math.floor(m/1440)+1;return`D${d} ${String(h).padStart(2,'0')}h`}
