#include "pebble.h"

static Window *window;

static TextLayer *date_layer;
static TextLayer *time_layer;
static TextLayer *city_layer;
static TextLayer *descr_layer;
static TextLayer *temperature_layer;
static TextLayer *gauge_name_layer;
static TextLayer *river_height_layer;
static TextLayer *river_temp_layer;

static AppSync sync;
static uint8_t sync_buffer[256];

enum WeatherKey {
  RIVER_GAUGE_KEY         = 5,
  RIVER_TEMP_KEY          = 4,
  RIVER_HEIGHT_KEY        = 3,
  WEATHER_CITY_KEY        = 2,  // TUPLE_CSTRING
  WEATHER_TEMPERATURE_KEY = 1,  // TUPLE_CSTRING
  WEATHER_DESCR_KEY       = 0,  // TUPLE_CSTRING
};

/*
"appKeys": {
    "gauge":       5,
    "rTemp":       4,
    "flow":        3,
    "city":        2,
    "temperature": 1,
    "descr":       0
  },
  */

void handle_minute_tick(struct tm *tick_time, TimeUnits units_changed) {
  // Need to be static because they're used by the system later.
  static char time_text[] = "00:00";
  static char date_text[] = "Xxxxxxxxx 00";

  char *time_format;


  // TODO: Only update the date when it's changed.
  strftime(date_text, sizeof(date_text), "%B %e", tick_time);
  text_layer_set_text(date_layer, date_text);


  if (clock_is_24h_style()) {
    time_format = "%R";
  } else {
    time_format = "%I:%M";
  }

  strftime(time_text, sizeof(time_text), time_format, tick_time);

  // Kludge to handle lack of non-padded hour format string
  // for twelve hour clock.
  if (!clock_is_24h_style() && (time_text[0] == '0')) {
    memmove(time_text, &time_text[1], sizeof(time_text) - 1);
  }

  text_layer_set_text(time_layer, time_text);
}

static void sync_error_callback(DictionaryResult dict_error, AppMessageResult app_message_error, void *context) {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "App Message Sync Error: %d", app_message_error);
}

static void sync_tuple_changed_callback(const uint32_t key, const Tuple* new_tuple, const Tuple* old_tuple, void* context) {
  //APP_LOG(APP_LOG_LEVEL_INFO, "sync_tuple_changed_callback: key: %d val: %s", (int)key, new_tuple->value->cstring);
  switch (key) {
    case WEATHER_CITY_KEY:
      text_layer_set_text(city_layer, new_tuple->value->cstring);
      break;

    case WEATHER_DESCR_KEY:
      text_layer_set_text(descr_layer, new_tuple->value->cstring);
      break;

    case WEATHER_TEMPERATURE_KEY:
      text_layer_set_text(temperature_layer, new_tuple->value->cstring);
      break;

    case RIVER_GAUGE_KEY:
      text_layer_set_text(gauge_name_layer, new_tuple->value->cstring);
      break;

    case RIVER_HEIGHT_KEY:
      text_layer_set_text(river_height_layer, new_tuple->value->cstring);
      break;

    case RIVER_TEMP_KEY:
      text_layer_set_text(river_temp_layer, new_tuple->value->cstring);
      break;
  }
}

static void send_cmd(void) {
  Tuplet value = TupletInteger(1, 1);

  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);

  if (iter == NULL) {
    return;
  }

  dict_write_tuplet(iter, &value);
  dict_write_end(iter);

  app_message_outbox_send();
}

static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);

  date_layer = text_layer_create(GRect(10, 10, 134, 32));
  text_layer_set_text_color(date_layer, GColorWhite);
  text_layer_set_background_color(date_layer, GColorClear);
  text_layer_set_font(date_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(date_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(date_layer));

  time_layer = text_layer_create(GRect(10, 44, 134, 32));
  text_layer_set_text_color(time_layer, GColorWhite);
  text_layer_set_background_color(time_layer, GColorClear);
  text_layer_set_font(time_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(time_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(time_layer));

  city_layer = text_layer_create(GRect(5, 81, 134, 17));
  text_layer_set_text_color(city_layer, GColorWhite);
  text_layer_set_background_color(city_layer, GColorClear);
  text_layer_set_font(city_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD));
  text_layer_set_text(city_layer, "Wolf Trap");
  text_layer_set_text_alignment(city_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(city_layer));

  descr_layer = text_layer_create(GRect(10, 98, 94, 28));
  text_layer_set_text_color(descr_layer, GColorWhite);
  text_layer_set_background_color(descr_layer, GColorClear);
  text_layer_set_font(descr_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(descr_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(descr_layer));

  temperature_layer = text_layer_create(GRect(90, 98, 94, 28));
  text_layer_set_text_color(temperature_layer, GColorWhite);
  text_layer_set_background_color(temperature_layer, GColorClear);
  text_layer_set_font(temperature_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(temperature_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(temperature_layer));

  gauge_name_layer = text_layer_create(GRect(5, 126, 134, 17));
  text_layer_set_text_color(gauge_name_layer, GColorWhite);
  text_layer_set_background_color(gauge_name_layer, GColorClear);
  text_layer_set_font(gauge_name_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD));
  text_layer_set_text_alignment(gauge_name_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(gauge_name_layer));

  river_height_layer = text_layer_create(GRect(10, 140, 134, 28));
  text_layer_set_text_color(river_height_layer, GColorWhite);
  text_layer_set_background_color(river_height_layer, GColorClear);
  text_layer_set_font(river_height_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(river_height_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(river_height_layer));

  river_temp_layer = text_layer_create(GRect(90, 140, 134, 28));
  text_layer_set_text_color(river_temp_layer, GColorWhite);
  text_layer_set_background_color(river_temp_layer, GColorClear);
  text_layer_set_font(river_temp_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(river_temp_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(river_temp_layer));

  Tuplet initial_values[] = {
    TupletCString(WEATHER_CITY_KEY, "Wolf Trap"),
    TupletCString(WEATHER_DESCR_KEY, "Look"),
    TupletCString(WEATHER_TEMPERATURE_KEY, "1234\u00B0C"),
    TupletCString(RIVER_GAUGE_KEY, "Little Bitty Falls"),
    TupletCString(RIVER_HEIGHT_KEY, "0.0ft 0.0\u00B0C"),
    TupletCString(RIVER_HEIGHT_KEY, "99\u00B0C"),
  };

  app_sync_init(&sync, sync_buffer, sizeof(sync_buffer), initial_values, ARRAY_LENGTH(initial_values),
      sync_tuple_changed_callback, sync_error_callback, NULL);

  send_cmd();
}

static void window_unload(Window *window) {
  app_sync_deinit(&sync);
  text_layer_destroy(date_layer);
  text_layer_destroy(time_layer);
  text_layer_destroy(descr_layer);
  text_layer_destroy(city_layer);
  text_layer_destroy(temperature_layer);
  text_layer_destroy(river_height_layer);
  text_layer_destroy(gauge_name_layer);
}

static void init(void) {
  window = window_create();
  window_set_background_color(window, GColorBlack);
  window_set_fullscreen(window, true);
  window_set_window_handlers(window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload
  });

  const int inbound_size = sizeof(sync_buffer);
  const int outbound_size = sizeof(sync_buffer);
  app_message_open(inbound_size, outbound_size);

  const bool animated = true;
  window_stack_push(window, animated);
  tick_timer_service_subscribe(MINUTE_UNIT, handle_minute_tick);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  window_destroy(window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
