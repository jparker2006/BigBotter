"use client";

import { Billboard, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, MathUtils, Vector3 } from "three";
import type { RoomId } from "../engine/types";
import type { ReplayFrame, WallHouseguest } from "./replayModel";

const ROOM_LAYOUT: Record<RoomId, { label: string; x: number; z: number; w: number; d: number; color: string }> = {
  hoh_room: { label: "HOH", x: -4.2, z: -2.8, w: 2.2, d: 1.7, color: "#22405a" },
  bedrooms: { label: "Bedrooms", x: -1.4, z: -2.8, w: 3.1, d: 1.7, color: "#29324d" },
  kitchen: { label: "Kitchen", x: 2.25, z: -2.65, w: 3.2, d: 2, color: "#0f4d5a" },
  living_room: { label: "Living", x: -3.65, z: -0.25, w: 3.2, d: 2.2, color: "#122744" },
  diary_room: { label: "Diary", x: -0.25, z: -0.1, w: 2.2, d: 1.8, color: "#39224f" },
  storage: { label: "Storage", x: 2.55, z: -0.25, w: 2.4, d: 1.8, color: "#243044" },
  have_not_room: { label: "Have-Not", x: -3.4, z: 2.4, w: 2.7, d: 1.8, color: "#31333b" },
  backyard: { label: "Backyard", x: 0.9, z: 2.25, w: 5.9, d: 2.1, color: "#155e4d" },
};

function roomPosition(roomId: RoomId, index: number): Vector3 {
  const room = ROOM_LAYOUT[roomId];
  const columns = Math.max(1, Math.floor(room.w / 0.72));
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = room.x - room.w / 2 + 0.45 + col * 0.7;
  const z = room.z - room.d / 2 + 0.48 + row * 0.58;
  return new Vector3(x, 0.42, z);
}

function statusColor(houseguest: WallHouseguest): string {
  if (houseguest.isCurrentHoh) return "#fde047";
  if (houseguest.isCurrentNominee) return "#fb7185";
  if (houseguest.hasCurrentVeto) return "#67e8f9";
  return "#e5e7eb";
}

const RoomBlock = memo(function RoomBlock({ roomId }: { roomId: RoomId }) {
  const room = ROOM_LAYOUT[roomId];
  return (
    <group position={[room.x, 0, room.z]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[room.w, 0.18, room.d]} />
        <meshStandardMaterial color={room.color} roughness={0.6} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.22, -room.d / 2]}>
        <boxGeometry args={[room.w + 0.04, 0.2, 0.06]} />
        <meshStandardMaterial color="#d8f3ff" emissive="#0ea5e9" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.22, room.d / 2]}>
        <boxGeometry args={[room.w + 0.04, 0.2, 0.06]} />
        <meshStandardMaterial color="#d8f3ff" emissive="#0ea5e9" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[-room.w / 2, 0.22, 0]}>
        <boxGeometry args={[0.06, 0.2, room.d]} />
        <meshStandardMaterial color="#d8f3ff" emissive="#0ea5e9" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[room.w / 2, 0.22, 0]}>
        <boxGeometry args={[0.06, 0.2, room.d]} />
        <meshStandardMaterial color="#d8f3ff" emissive="#0ea5e9" emissiveIntensity={0.18} />
      </mesh>
      <Text
        position={[-room.w / 2 + 0.18, 0.36, -room.d / 2 + 0.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="left"
        fontSize={0.16}
        letterSpacing={0.08}
        color="#e0f2fe"
      >
        {room.label.toUpperCase()}
      </Text>
    </group>
  );
});

function AvatarMarker({ houseguest, target }: { houseguest: WallHouseguest; target: Vector3 }) {
  const groupRef = useRef<Group>(null);
  // Keep the initial mount position stable so React re-renders never snap the avatar;
  // the lerp below drives smooth movement toward the live `target`.
  const [start] = useState(() => target.clone());
  const color = statusColor(houseguest);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(target, MathUtils.clamp(delta * 4.6, 0, 1));
  });

  return (
    <group ref={groupRef} position={start}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.16, 20]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.2, 20, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} />
      </mesh>
      <Billboard position={[0, 0.86, 0]}>
        <Text fontSize={0.16} anchorX="center" anchorY="bottom" color="#e2e8f0" outlineWidth={0.012} outlineColor="#020617">
          {houseguest.name.split(" ")[0]}
        </Text>
      </Billboard>
    </group>
  );
}

// Recovers gracefully from WebGL context loss instead of leaving a blank white canvas.
// preventDefault() on the lost event lets the browser restore the same context.
function ContextGuard({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    const handleRestored = () => {
      onRestored();
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", handleLost as EventListener, false);
    canvas.addEventListener("webglcontextrestored", handleRestored, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost as EventListener);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, [gl, invalidate, onLost, onRestored]);

  return null;
}

export default function House3D({ frame }: { frame: ReplayFrame }) {
  // Safety net for a genuine, browser-initiated GL context loss (e.g. GPU reset). The guard
  // below preventDefault()s the loss so the browser restores the same context; meanwhile we
  // show a fallback instead of a blank white canvas. (Dev StrictMode double-mount is handled
  // by disabling reactStrictMode in next.config.ts, which R3F's GL context requires.)
  const [contextLost, setContextLost] = useState(false);
  const onLost = useCallback(() => setContextLost(true), []);
  const onRestored = useCallback(() => setContextLost(false), []);

  const avatars = useMemo(
    () =>
      frame.houseguests
        .filter((houseguest) => houseguest.currentStatus === "active")
        .map((houseguest) => {
          const roomGuests = frame.rooms[houseguest.currentLocation] ?? [];
          const roomIndex = Math.max(0, roomGuests.findIndex((candidate) => candidate.id === houseguest.id));
          return { houseguest, target: roomPosition(houseguest.currentLocation, roomIndex) };
        }),
    [frame],
  );

  return (
    <div className="relative h-[460px] overflow-hidden rounded-[1.75rem] border border-cyan-200/20 bg-[#020817] shadow-2xl">
      <Canvas
        camera={{ position: [5.8, 6.7, 7.4], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
      >
        <color attach="background" args={["#020817"]} />
        <ContextGuard onLost={onLost} onRestored={onRestored} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 8, 4]} intensity={1.2} />
        <pointLight position={[-5, 4, -4]} color="#fde047" intensity={9} distance={9} />
        <pointLight position={[4, 4, 3]} color="#22d3ee" intensity={8} distance={9} />
        <group rotation={[0, -0.34, 0]}>
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[9.8, 0.12, 6.9]} />
            <meshStandardMaterial color="#07111f" roughness={0.7} />
          </mesh>
          {(Object.keys(ROOM_LAYOUT) as RoomId[]).map((roomId) => (
            <RoomBlock key={roomId} roomId={roomId} />
          ))}
          {avatars.map(({ houseguest, target }) => (
            <AvatarMarker key={houseguest.id} houseguest={houseguest} target={target} />
          ))}
        </group>
      </Canvas>
      {contextLost ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#020817]/95 text-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-200">Reacquiring feed…</p>
            <p className="mt-2 text-xs text-slate-400">Restoring the 3D house render context.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
