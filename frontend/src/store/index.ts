import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import type { CartItem, Product } from "../types";
import { lineTotal } from "../utils";

interface Auth {
  token: string;
  username: string;
  role: string;
}
const authSlice = createSlice({
  name: "auth",
  initialState: null as Auth | null,
  reducers: {
    login: (_, a: PayloadAction<Auth>) => a.payload,
    logout: () => null,
  },
});
const cartSlice = createSlice({
  name: "cart",
  initialState: [] as CartItem[],
  reducers: {
    add: (state, a: PayloadAction<{ product: Product; quantity: number }>) => {
      const item = state.find((i) => i.product.id === a.payload.product.id);
      if (item) {
        item.quantity = Number((item.quantity + a.payload.quantity).toFixed(3));
        item.product = a.payload.product;
      }
      else state.push({ ...a.payload, discount: 0 });
    },
    change: (
      state,
      a: PayloadAction<{ id: number; quantity?: number; discount?: number }>,
    ) => {
      const item = state.find((i) => i.product.id === a.payload.id);
      if (item) {
        if (a.payload.quantity !== undefined)
          item.quantity = a.payload.quantity;
        if (a.payload.discount !== undefined)
          item.discount = a.payload.discount;
      }
    },
    remove: (state, a: PayloadAction<number>) =>
      state.filter((i) => i.product.id !== a.payload),
    clear: () => [],
  },
});
const raw = fetchBaseQuery({
  baseUrl: new URL("/api/v1", globalThis.location?.origin || "http://localhost").toString(),
  credentials: "same-origin",
  prepareHeaders: (headers, { getState }) => {
    const auth = (getState() as { auth: Auth | null }).auth;
    if (auth) headers.set("Authorization", "Bearer " + auth.token);
    return headers;
  },
});
const baseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extra) => {
  const request: FetchArgs = typeof args === "string" ? { url: args } : args;
  if (request.method && request.method !== "GET") {
    const csrf = await raw("/auth/csrf", api, extra);
    if (csrf.error) return { error: csrf.error };
    request.headers = {
      ...request.headers,
      "X-XSRF-TOKEN": (csrf.data as { token: string }).token,
    };
  }
  const result = await raw(request, api, extra);
  if (result.error?.status === 401 && request.url !== "/auth/login") {
    api.dispatch(authSlice.actions.logout());
    api.dispatch(cartSlice.actions.clear());
  }
  return result;
};
export const api = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: ["Data"],
  endpoints: (builder) => ({
    get: builder.query<unknown, string>({
      query: (path) => path,
      providesTags: ["Data"],
    }),
    send: builder.mutation<unknown, FetchArgs>({
      query: (args) => args,
      invalidatesTags: ["Data"],
    }),
  }),
});
export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    cart: cartSlice.reducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (g) => g().concat(api.middleware),
});
export type RootState = ReturnType<typeof store.getState>;
export type Dispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<Dispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const { login, logout } = authSlice.actions;
export const { add, change, remove, clear } = cartSlice.actions;
export const { useGetQuery, useSendMutation } = api;
export function useData<T>(path: string, skip = false) {
  // Poll every 30s when WebSocket is unavailable (e.g. Vercel proxy).
  const result = useGetQuery(path, { skip, pollingInterval: 30000 });
  return { ...result, data: result.data as T | undefined };
}
export const cartTotal = (items: CartItem[]) =>
  items.reduce(
    (sum, i) => sum + lineTotal(i.product.price, i.quantity, i.discount),
    0,
  ) / 100;
