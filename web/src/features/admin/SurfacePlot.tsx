import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Alert, Box, Button, FocusTrap, Group, Loader, Paper, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowsMaximize, IconArrowsMinimize, IconHandMove, IconRotate, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import type { Data, Layout, PlotlyHTMLElement, PlotMouseEvent } from "plotly.js";
import { hasSurfaceArea, interpolateSurface, type SurfaceModel } from "./surface-data";
import { number } from "./analytics";

type Plotly = typeof import("plotly.js");
let modulePromise: Promise<Plotly> | null = null;
function loadPlotly() {
  modulePromise ??= import("plotly.js-gl3d-dist-min").then((module) => module.default).catch((error: unknown) => { modulePromise = null; throw error; });
  return modulePromise;
}
interface Vector { x: number; y: number; z: number }
interface SceneCamera { eye: Vector; up: Vector; center: Vector }
const initialCamera: SceneCamera = { eye: { x: 1.65, y: 1.8, z: 1.35 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } };
function readCamera(value: unknown): SceneCamera | null {
  const vector = (item: unknown): item is Vector => typeof item === "object" && item !== null && "x" in item && "y" in item && "z" in item && typeof item.x === "number" && typeof item.y === "number" && typeof item.z === "number";
  if (typeof value !== "object" || value === null || !("eye" in value) || !vector(value.eye)) return null;
  return { eye: value.eye, up: "up" in value && vector(value.up) ? value.up : initialCamera.up, center: "center" in value && vector(value.center) ? value.center : initialCamera.center };
}
const colors: [number, string][] = [[0,"#e2edf7"],[.35,"#8ab0d3"],[.7,"#396fa5"],[1,"#caa052"]];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char] ?? char));

export function SurfacePlot({ id, title, description, model }: { id: string; title: string; description: string; model: SurfaceModel }) {
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const api = useRef<Plotly | null>(null);
  const graph = useRef<PlotlyHTMLElement | null>(null);
  const camera = useRef<SceneCamera>(structuredClone(initialCamera));
  const touchPositions = useRef(new Map<number, { x: number; y: number }>());
  const touchFrame = useRef<number | null>(null);
  const pendingCamera = useRef<SceneCamera | null>(null);
  const mobile = useMediaQuery("(max-width: 47.99375em), (pointer: coarse)");
  const [gestures, setGestures] = useState(false);
  const [mode, setMode] = useState("orbit");
  const [fullScreen, setFullScreen] = useState(false);
  const [fallbackFullScreen, setFallbackFullScreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(() => [...model.points].sort((a,b) => b.z - a.z)[0]?.key ?? null);
  const selectedPoint = model.points.find((point) => point.key === selected);
  const canInteract = !mobile || gestures || fullScreen;
  const hasArea = hasSurfaceArea(model);
  const max = Math.max(0,...model.points.map((point) => point.z));
  const choices = useMemo(() => model.points.map((point) => ({ value: point.key, label: `${point.label} · ${number(point.z)} ${model.zTitle.toLocaleLowerCase("ru")}` })), [model]);

  // Parent keys this component by response revision/filter. Each instance owns
  // a DOM node, so a late load cannot purge or overwrite a newer scene.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let resizeFrame = 0;
    const lostContext = () => { if (!disposed) setError("3D-сцена потеряла связь с графическим ускорителем. Попробуйте загрузить её снова."); };
    element.addEventListener("webglcontextlost", lostContext, true);
    setReady(false);
    setError(null);
    const draw = async () => {
      try {
        const Plotly = await loadPlotly();
        if (disposed) return;
        const probe = document.createElement("canvas");
        const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
        if (!gl) throw new Error("На этом устройстве недоступна 3D-графика. Показатели можно посмотреть во вкладках «Обзор», «Навыки» и «Данные».");
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        api.current = Plotly;
        const surface = interpolateSurface(model);
        const points: Data = { type: "scatter3d", mode: "markers", x: model.points.map((point) => point.x), y: model.points.map((point) => point.y), z: model.points.map((point) => point.z), text: model.points.map((point) => escapeHtml(point.detail)), marker: { size: model.points.map((point) => point.z === 0 ? 2 : 3.5), color: "#245b8d", opacity: .9 }, hovertemplate: "%{text}<extra></extra>", showlegend: false };
        const traces: Data[] = [points];
        if (hasArea) {
          // @types/plotly.js omits surface-specific lighting and color limits.
          // Keep the documented surface fields in a separate structural value.
          const terrain = { type: "surface" as const, x: surface.x, y: surface.y, z: surface.z, connectgaps: false, colorscale: colors, cmin: 0, cmax: Math.max(1,max), showscale: false, opacity: .95, lighting: { ambient: .8, diffuse: .7, specular: .1, roughness: .9 }, hoverinfo: "skip" as const, showlegend: false };
          traces.unshift(terrain);
        }
        const ticks = (values: number[], labels: string[], limit: number) => {
          const every = Math.max(1,Math.ceil(values.length / limit));
          return { tickvals: values.filter((_,index) => index % every === 0), ticktext: labels.filter((_,index) => index % every === 0) };
        };
        const axis = (title: string) => ({ title: { text: title, font: { size: 12, color: "#647180" } }, color: "#647180", gridcolor: "#e3e8ef", zerolinecolor: "#d4dce6", showbackground: false, tickfont: { size: 11 } });
        const narrow = element.clientWidth < 450;
        const layout: Partial<Layout> = {
          margin: { l: narrow ? 22 : 12, r: narrow ? 22 : 12, t: 6, b: 6 }, paper_bgcolor: "rgba(0,0,0,0)", font: { family: "system-ui, sans-serif", color: "#202b3b", size: 12 }, hoverlabel: { bgcolor: "#ffffff", font: { color: "#202b3b", size: 12 }, bordercolor: "#d4dce6" }, uirevision: id,
          scene: { camera: camera.current, dragmode: "orbit", aspectmode: "manual", aspectratio: { x: 1.25, y: 1, z: .7 }, bgcolor: "rgba(0,0,0,0)", xaxis: { ...axis(model.xTitle), ...ticks(model.xTicks,model.xLabels,narrow ? 3 : 5), range: [model.x[0] - .6,model.x.at(-1)! + .6] }, yaxis: { ...axis(narrow && id === "distribution" ? "Студентов" : model.yTitle), ...ticks(model.yTicks,model.yLabels,narrow ? 4 : 7) }, zaxis: { ...axis(model.zTitle), range: [0,Math.max(1,max * 1.08)], nticks: 4 } },
        };
        const result = await Plotly.newPlot(element,traces,layout,{ displayModeBar: false, responsive: true, scrollZoom: false, displaylogo: false });
        if (disposed) { Plotly.purge(element); return; }
        graph.current = result;
        result.on("plotly_click",(event: PlotMouseEvent) => {
          const point = event.points[0];
          if (!point || point.data.type !== "scatter3d") return;
          const found = model.points.find((item) => item.x === point.x && item.y === point.y);
          if (found) setSelected(found.key);
        });
        result.on("plotly_relayout",(event) => {
          const next = "scene.camera" in event ? readCamera(event["scene.camera"]) : null;
          if (next) camera.current = next;
        });
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => { if (!disposed) void Promise.resolve(Plotly.Plots.resize(element)).catch(() => {}); });
        });
        observer.observe(element);
        setReady(true);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Не удалось загрузить 3D-график.");
      }
    };
    void draw();
    return () => { disposed = true; element.removeEventListener("webglcontextlost", lostContext, true); observer?.disconnect(); cancelAnimationFrame(resizeFrame); if (touchFrame.current !== null) cancelAnimationFrame(touchFrame.current); if (api.current && graph.current) api.current.purge(element); graph.current = null; };
  }, [model, hasArea, max, id, attempt]);

  useEffect(() => { if (mobile) setGestures(false); }, [mobile]);
  useEffect(() => {
    const update = () => {
      const native = Boolean(shell.current && document.fullscreenElement === shell.current);
      setFullScreen(native || fallbackFullScreen);
      if (!native && !fallbackFullScreen) setGestures(false);
    };
    document.addEventListener("fullscreenchange",update);
    update();
    return () => document.removeEventListener("fullscreenchange",update);
  }, [fallbackFullScreen]);
  useEffect(() => {
    if (!fullScreen && !fallbackFullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFallbackFullScreen(false); };
    window.addEventListener("keydown",escape,true);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown",escape,true); };
  }, [fullScreen, fallbackFullScreen]);

  const relayout = (values: Record<string, unknown>) => {
    if (!api.current || !graph.current) return;
    void api.current.relayout(graph.current,values).catch(() => setError("Не удалось обновить вид 3D-сцены. Попробуйте загрузить её снова."));
  };
  const moveCamera = (next: SceneCamera) => { camera.current = next; relayout({ "scene.camera": next }); };
  const zoom = (factor: number) => {
    const next = structuredClone(camera.current);
    const eye = next.eye ?? initialCamera.eye!;
    const distance = Math.hypot(eye.x,eye.y,eye.z) * factor;
    if (distance < .8 || distance > 7) return;
    next.eye = { x: eye.x * factor, y: eye.y * factor, z: eye.z * factor };
    moveCamera(next);
  };
  const fullscreen = async () => {
    if (fullScreen) {
      if (document.fullscreenElement === shell.current) await document.exitFullscreen().catch(() => {});
      setFallbackFullScreen(false);
    } else {
      try { if (!shell.current?.requestFullscreen) throw new Error(); await shell.current.requestFullscreen(); }
      catch { setFallbackFullScreen(true); }
    }
  };
  // A non-passive listener prevents Ctrl+wheel from zooming the whole page.
  useEffect(() => {
    const element = view.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (canInteract && ready && !error && (event.ctrlKey || fullScreen)) { event.preventDefault(); event.stopPropagation(); zoom(event.deltaY > 0 ? 1.08 : .93); }
    };
    element.addEventListener("wheel", wheel, { passive: false, capture: true });
    return () => element.removeEventListener("wheel", wheel, true);
  });
  useEffect(() => {
    if (!ready || !api.current || !graph.current || error) return;
    void api.current.restyle(graph.current, { "marker.color": [model.points.map((point) => point.key === selected ? "#b88632" : "#245b8d")], "marker.size": [model.points.map((point) => point.key === selected ? 6 : point.z === 0 ? 2 : 3.5)] }, [hasArea ? 1 : 0]).catch(() => {});
  }, [selected, ready, error, model, hasArea]);
  const enqueueTouchCamera = (next: SceneCamera) => {
    camera.current = next;
    pendingCamera.current = next;
    if (touchFrame.current !== null) return;
    touchFrame.current = requestAnimationFrame(() => { touchFrame.current = null; if (pendingCamera.current) { relayout({ "scene.camera": pendingCamera.current }); pendingCamera.current = null; } });
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !canInteract || !ready) return;
    event.preventDefault(); event.stopPropagation();
    touchPositions.current.set(event.pointerId,{ x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !canInteract || !touchPositions.current.has(event.pointerId)) return;
    event.preventDefault(); event.stopPropagation();
    const before = [...touchPositions.current.values()];
    touchPositions.current.set(event.pointerId,{ x: event.clientX, y: event.clientY });
    const after = [...touchPositions.current.values()];
    const dx = after.reduce((sum,p) => sum + p.x,0)/after.length - before.reduce((sum,p) => sum + p.x,0)/before.length;
    const dy = after.reduce((sum,p) => sum + p.y,0)/after.length - before.reduce((sum,p) => sum + p.y,0)/before.length;
    const next = structuredClone(camera.current);
    const eye = next.eye ?? initialCamera.eye!;
    const center = next.center ?? { x: 0, y: 0, z: 0 };
    const yaw = Math.atan2(eye.y,eye.x);
    if (after.length === 1 && mode === "orbit") {
      const distance = Math.hypot(eye.x,eye.y,eye.z);
      const angle = Math.max(.08,Math.min(1.48,Math.atan2(eye.z,Math.hypot(eye.x,eye.y)) - dy * .008));
      const nextYaw = yaw - dx * .008;
      next.eye = { x: Math.cos(nextYaw)*Math.cos(angle)*distance, y: Math.sin(nextYaw)*Math.cos(angle)*distance, z: Math.sin(angle)*distance };
      next.up = { x: 0, y: 0, z: 1 };
    } else {
      next.center = { x: center.x + dx * .003 * Math.sin(yaw), y: center.y - dx * .003 * Math.cos(yaw), z: center.z + dy * .003 };
      if (after.length >= 2) {
        const oldDistance = Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y);
        const newDistance = Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
        const factor = Math.max(.8,Math.min(1.25,oldDistance / Math.max(1,newDistance)));
        const distance = Math.hypot(eye.x,eye.y,eye.z)*factor;
        if (distance >= .8 && distance <= 7) next.eye = { x: eye.x*factor, y: eye.y*factor, z: eye.z*factor };
      }
    }
    enqueueTouchCamera(next);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => { touchPositions.current.delete(event.pointerId); };

  return <FocusTrap active={fullScreen} innerRef={shell}><Paper withBorder p="lg" className={`surface-shell ${fallbackFullScreen ? "surface-fullscreen-fallback" : ""}`} data-surface={id} data-ready={ready && !error} data-gestures={canInteract} role={fallbackFullScreen ? "dialog" : undefined} aria-modal={fallbackFullScreen || undefined} aria-label={fallbackFullScreen ? title : undefined}>
    <Group justify="space-between" align="flex-start"><Box><Title order={3} size="h4">{title}</Title><Text size="xs" c="dimmed" mt={5}>{description}</Text></Box><Button variant="default" size="xs" leftSection={fullScreen ? <IconArrowsMinimize size={16} /> : <IconArrowsMaximize size={16} />} onClick={() => void fullscreen()} disabled={!ready || !!error}>{fullScreen ? "Закрыть полный экран" : "На весь экран"}</Button></Group>
    <Group mt="md" gap="xs" className="surface-toolbar">
      <SegmentedControl size="xs" aria-label={`Режим управления: ${title}`} value={mode} onChange={(value) => { setMode(value); relayout({ "scene.dragmode": value }); }} disabled={!ready || !!error} data={[{ value: "orbit", label: <Group gap={5} wrap="nowrap"><IconRotate size={15} />Вращение</Group> }, { value: "pan", label: <Group gap={5} wrap="nowrap"><IconHandMove size={15} />Перемещение</Group> }]} />
      <Button size="xs" variant="default" onClick={() => moveCamera({ eye: { x: 0, y: 0, z: 2.8 }, center: { x: 0,y: 0,z: 0 }, up: { x: 0,y: 1,z: 0 } })} disabled={!ready || !!error}>Сверху</Button>
      <Button size="xs" variant="default" onClick={() => moveCamera(structuredClone(initialCamera))} disabled={!ready || !!error}>Сбросить вид</Button>
      <Button size="xs" variant="default" aria-label={`Приблизить: ${title}`} onClick={() => zoom(.8)} disabled={!ready || !!error}><IconZoomIn size={17} /></Button>
      <Button size="xs" variant="default" aria-label={`Отдалить: ${title}`} onClick={() => zoom(1.25)} disabled={!ready || !!error}><IconZoomOut size={17} /></Button>
      {mobile && !fullScreen && <Button size="xs" variant={gestures ? "filled" : "light"} onClick={() => { touchPositions.current.clear(); setGestures((value) => !value); }} disabled={!ready || !!error}>{gestures ? "Завершить управление" : "Включить жесты"}</Button>}
    </Group>
    {error && <Alert color="red" title="3D-график недоступен" mt="md"><Stack gap="xs"><Text size="sm">{error}</Text><Button size="xs" variant="light" onClick={() => setAttempt((value) => value + 1)}>Загрузить снова</Button></Stack></Alert>}
    <div ref={view} className={`surface-view ${canInteract ? "surface-interactive" : ""}`} onPointerDownCapture={onPointerDown} onPointerMoveCapture={onPointerMove} onPointerUpCapture={onPointerEnd} onPointerCancelCapture={onPointerEnd} onTouchStartCapture={(event) => { if (canInteract) event.stopPropagation(); }} onTouchMoveCapture={(event) => { if (canInteract) event.stopPropagation(); }}>
      <div ref={canvas} className="surface-canvas" role="figure" aria-label={`${title}. ${model.xTitle}; ${model.yTitle}; высота — ${model.zTitle.toLocaleLowerCase("ru")}. Исходных точек: ${model.points.length}.`} />
      {!ready && !error && <div className="surface-loading"><Loader size="sm" /><Text size="sm" c="dimmed">Загружаем 3D…</Text></div>}
      {!canInteract && <div className="surface-touch-shield" aria-hidden="true"><span>Для вращения включите жесты</span></div>}
    </div>
    <Group justify="space-between" gap="xs" className="surface-legend"><Text size="xs" c="dimmed">{model.zTitle}: 0</Text><div className="surface-color-scale" aria-hidden="true" /><Text size="xs" c="dimmed">{number(max)}</Text><Text size="xs" c="dimmed">Точки — исходные значения</Text></Group>
    <Text size="xs" c="dimmed" mt={8}>{mobile ? "Один палец — выбранное действие. Два — масштаб и перемещение. Точные значения доступны в списке ниже." : "Перетаскивайте для вращения или перемещения. Масштаб — кнопками +/−; Ctrl + колесо — над графиком."}</Text>
    {!hasArea && <Text size="sm" c="dimmed" mt={8}>Для непрерывного рельефа недостаточно соседних записей. Показаны доступные точки.</Text>}
    <Select mt="md" label="Точная точка" aria-label={`Точная точка: ${title}`} searchable value={selected} onChange={setSelected} data={choices} allowDeselect={false} comboboxProps={{ withinPortal: false }} nothingFoundMessage="Точка не найдена" />
    {selectedPoint && <div className="surface-selection" aria-live="polite"><Text size="sm" fw={600}>{selectedPoint.detail}</Text>{selectedPoint.skills && <>{selectedPoint.skills.length ? <ul>{selectedPoint.skills.map((skill) => <li key={skill.skill_id}>{skill.skill} · {number(skill.avg_level)}% · студентов: {number(skill.students_count)}</li>)}</ul> : <Text size="xs" c="dimmed" mt={4}>В этом диапазоне нет навыков из ответа API.</Text>}</>}</div>}
  </Paper></FocusTrap>;
}
