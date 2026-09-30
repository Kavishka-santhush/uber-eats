import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/auth/store';

/**
 * Shared Socket.io client (React Native). Lazily connects once an access token
 * exists and re-authenticates with the freshest token on every (re)connect.
 * The server auto-joins each socket to user:<id> plus role rooms (drivers,
 * branch staff, ops, admins); joinOrder/joinBranch add the explicit rooms used
 * by live tracking and the restaurant back office.
 */

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = useAuth.getState().accessToken;
  if (!token) return null;
  if (!socket) {
    socket = io(config.socketUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });
    // keep the handshake token fresh after silent refreshes
    socket.on('connect', () => {
      const t = useAuth.getState().accessToken;
      if (t && socket?.auth?.token !== t) {
        if (socket) socket.auth = { token: t };
        socket?.disconnect();
        socket?.connect();
      }
    });
  } else {
    const t = useAuth.getState().accessToken;
    if (t && socket.auth?.token !== t) socket.auth = { token: t };
  }
  return socket;
}

export function joinOrder(orderId: string) {
  getSocket()?.emit('order:join', { orderId });
}
export function leaveOrder(orderId: string) {
  getSocket()?.emit('order:leave', { orderId });
}
export function joinBranch(branchId: string) {
  getSocket()?.emit('branch:join', { branchId });
}
export function leaveBranch(branchId: string) {
  getSocket()?.emit('branch:leave', { branchId });
}

/** Driver GPS ping — call on a ~3s cadence while on an active delivery. */
export function emitDeliveryLocation(payload: { deliveryId: string; lat: number; lng: number; heading?: number; speed?: number }) {
  getSocket()?.emit('delivery:location', payload);
}

export function emitDriverPing(lat: number, lng: number) {
  getSocket()?.emit('driver:ping', { lat, lng });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
