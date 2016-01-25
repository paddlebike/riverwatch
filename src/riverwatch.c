#include "pebble.h"

static Window *window;

//Blutetooth Status
static GBitmap *bluetooth_image;
static BitmapLayer *bluetooth_layer;

static TextLayer *date_layer;
static TextLayer *time_layer;
static TextLayer *gauge_time_layer;
static TextLayer *descr_layer;
static TextLayer *temperature_layer;
static TextLayer *river_height_layer;
static TextLayer *river_temp_layer;

static AppSync sync;

static int fahrenheit = 0;
static char air_buff[10];
static char h2o_buff[10];


#define   SHOW_BATTERY_KEY        7
#define   FAHRENHEIT_KEY          6
#define   PLAY_KEY                5
#define   GAUGE_TIME_KEY          4
#define   RIVER_TEMP_KEY          3
#define   RIVER_HEIGHT_KEY        2
#define   WEATHER_TEMPERATURE_KEY 1
#define   WEATHER_DESCR_KEY       0


#ifdef PBL_COLOR
#define TIME_COLOR       GColorWhite
#define WEATHER_COLOR    GColorOrange
#define HOT_COLOR        GColorRed
#define WARM_COLOR       GColorWhite
#define COLD_COLOR       GColorVividCerulean
#define RIVER_COLOR_LOW  GColorCeleste
#define RIVER_COLOR_PLAY GColorBrightGreen
#define RIVER_COLOR_HIGH GColorRed
#define IMAGE_BT_CONNECTED    RESOURCE_ID_IMAGE_BT_CONNECTED_COLOR
#define IMAGE_BT_DISCONNECTED RESOURCE_ID_IMAGE_BT_DISCONNECTED_COLOR
#else
#define TIME_COLOR       GColorWhite
#define WEATHER_COLOR    GColorWhite
#define HOT_COLOR        GColorWhite
#define WARM_COLOR       GColorWhite
#define COLD_COLOR       GColorWhite
#define RIVER_COLOR_LOW  GColorWhite
#define RIVER_COLOR_PLAY GColorWhite
#define RIVER_COLOR_HIGH GColorWhite
#define IMAGE_BT_CONNECTED    RESOURCE_ID_IMAGE_BT_CONNECTED
#define IMAGE_BT_DISCONNECTED RESOURCE_ID_IMAGE_BT_DISCONNECTED
#endif


/*
 *METHODS
 */
//Used to set maintain which image is showing. Switch old images with new ones
static void set_container_image(GBitmap **bmp_image, BitmapLayer *bmp_layer, const int resource_id, GPoint origin){
	//Temp variable for old image
	GBitmap *old_image = *bmp_image;

	//Replace old image with new image //(*bmp_image)->bounds.size
	*bmp_image = gbitmap_create_with_resource(resource_id);
	GRect frame = (GRect) {
		.origin = origin,
		.size = gbitmap_get_bounds(*bmp_image).size
	};
	bitmap_layer_set_bitmap(bmp_layer, *bmp_image);
	layer_set_frame(bitmap_layer_get_layer(bmp_layer), frame);

	//Get rid of the old image if it exits
	if (old_image != NULL)
		gbitmap_destroy(old_image);
}

static void inbox_received_callback(DictionaryIterator *iterator, void *context) {

  Tuple * data = NULL;
  
  data = dict_find(iterator, FAHRENHEIT_KEY);
  if (data) {
    fahrenheit = data->value->int16;
  }
  
  data = dict_find(iterator, WEATHER_DESCR_KEY);
  if (data) {
    text_layer_set_text(descr_layer, data->value->cstring);
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Setting conditions: %s", data->value->cstring);
  }
  
  data = dict_find(iterator, WEATHER_TEMPERATURE_KEY);
  if (data) {
    int temp = data->value->int16;
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Got air temp key: value %d", data->value->int16);
    if      (temp < 0 ) text_layer_set_text_color(temperature_layer, COLD_COLOR);
    else if (temp > 30) text_layer_set_text_color(temperature_layer, HOT_COLOR);
    else text_layer_set_text_color(temperature_layer, WARM_COLOR);
      
    if (fahrenheit) {
      temp = temp  * 9 / 5 + 32;
      snprintf(air_buff, sizeof(air_buff), "%df", temp);
    } else {
      snprintf(air_buff, sizeof(air_buff), "%dc", temp);
    }
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Setting air temp: %s", air_buff);
    text_layer_set_text(temperature_layer, air_buff);
  }
  
  data = dict_find(iterator, RIVER_HEIGHT_KEY);
  if (data) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Got river height key: value %s", data->value->cstring);
    text_layer_set_text(river_height_layer, data->value->cstring);
  }
  
  data = dict_find(iterator, RIVER_TEMP_KEY);
  if (data) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Got river temp key: value %d", data->value->int16);
    int temp = data->value->int16;
    if      (temp < 10) text_layer_set_text_color(river_temp_layer, COLD_COLOR);
    else if (temp > 30) text_layer_set_text_color(river_temp_layer, HOT_COLOR);
    else text_layer_set_text_color(river_temp_layer, WARM_COLOR);
    if (fahrenheit) {
      temp = temp  * 9 / 5 + 32;
      snprintf(h2o_buff, sizeof(h2o_buff), "%df", temp); //\\xB0F
    } else {
      snprintf(h2o_buff, sizeof(h2o_buff), "%dc", temp); //\\xB0C
    }
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Setting river temp: %s", h2o_buff);
    text_layer_set_text(river_temp_layer, h2o_buff);
  }

  data = dict_find(iterator, PLAY_KEY);
  if (data) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Got river height play key");
    int play = data->value->int16;
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Got river height play: %d",play);
    if (play < 0) text_layer_set_text_color(river_height_layer, RIVER_COLOR_LOW);
    else if (play == 0) text_layer_set_text_color(river_height_layer, RIVER_COLOR_PLAY);
    else if (play > 0) text_layer_set_text_color(river_height_layer, RIVER_COLOR_HIGH);
  }

  
  Tuple *r_time = dict_find(iterator, GAUGE_TIME_KEY);
  if (r_time) {
    text_layer_set_text(gauge_time_layer, r_time->value->cstring);
  }
  
}


static void inbox_dropped_callback(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Message dropped!");
}

static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox send failed!");
}

static void outbox_sent_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Outbox send success!");
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

void handle_minute_tick(struct tm *tick_time, TimeUnits units_changed) {
  // Need to be static because they're used by the system later.
  static char time_text[] = "00:00";
  static char date_text[] = "Xxxxxxxxx 00";

  char *time_format;


  // TODO: Only update the date when it's changed.
  strftime(date_text, sizeof(date_text), "%a %b %e", tick_time);
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

  if (tick_time->tm_min == 50){
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Refreshing gauges:");
    send_cmd();
  }
}

static void handle_bluetooth(bool connected) {
	if(connected)
		set_container_image(&bluetooth_image, bluetooth_layer, IMAGE_BT_CONNECTED, GPoint(125, 100));
	else	
		set_container_image(&bluetooth_image, bluetooth_layer, IMAGE_BT_DISCONNECTED, GPoint(125, 100));
}

static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);

  date_layer = text_layer_create(GRect(10, 10, 150, 32));
  text_layer_set_text_color(date_layer, TIME_COLOR);
  text_layer_set_background_color(date_layer, GColorClear);
  text_layer_set_font(date_layer, fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ROBOTO_CONDENSED_21)));
  text_layer_set_text_alignment(date_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(date_layer));

  time_layer = text_layer_create(GRect(10, 34, 134, 56));
  text_layer_set_text_color(time_layer, TIME_COLOR);
  text_layer_set_background_color(time_layer, GColorClear);
  text_layer_set_font(time_layer, fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ROBOTO_BOLD_SUBSET_49)));
  text_layer_set_text_alignment(time_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(time_layer));

  gauge_time_layer = text_layer_create(GRect(5, 95, 134, 23));
  text_layer_set_text_color(gauge_time_layer, GColorWhite);
  text_layer_set_background_color(gauge_time_layer, GColorClear);
  text_layer_set_font(gauge_time_layer, fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ROBOTO_CONDENSED_21)));
  text_layer_set_text_alignment(gauge_time_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(gauge_time_layer));
/*
	connection_layer = text_layer_create(GRect(115, 95, 60, 28));
	text_layer_set_text_color(connection_layer, GColorWhite);
	text_layer_set_background_color(connection_layer, GColorClear);
	text_layer_set_font(connection_layer, fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ROBOTO_CONDENSED_21)));
	text_layer_set_text_alignment(connection_layer, GTextAlignmentLeft);
	handle_bluetooth(bluetooth_connection_service_peek());
  layer_add_child(window_layer, text_layer_get_layer(connection_layer));
*/
  
  //Set up bluetooth status //.size = bluetooth_image->bounds.size
	bluetooth_image = gbitmap_create_with_resource(IMAGE_BT_CONNECTED);
	GRect frame1 = (GRect) {
    .origin = { .x = 125, .y = 100 },
    .size = gbitmap_get_bounds(bluetooth_image).size
	};
	bluetooth_layer = bitmap_layer_create(frame1);
	bitmap_layer_set_bitmap(bluetooth_layer, bluetooth_image);
	layer_add_child(window_layer, bitmap_layer_get_layer(bluetooth_layer));
  
  
  descr_layer = text_layer_create(GRect(5, 115, 70, 28));
  text_layer_set_text_color(descr_layer, WEATHER_COLOR);
  text_layer_set_background_color(descr_layer, GColorClear);
  text_layer_set_font(descr_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD));
  text_layer_set_text_alignment(descr_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(descr_layer));

  temperature_layer = text_layer_create(GRect(70, 115, 74, 28));
  text_layer_set_text_color(temperature_layer, GColorWhite);
  text_layer_set_background_color(temperature_layer, GColorClear);
  text_layer_set_font(temperature_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(temperature_layer, GTextAlignmentRight);
  text_layer_set_text(temperature_layer, "72f");
  layer_add_child(window_layer, text_layer_get_layer(temperature_layer));

  river_height_layer = text_layer_create(GRect(5, 140, 68, 28));
  text_layer_set_text_color(river_height_layer, GColorWhite);
  text_layer_set_background_color(river_height_layer, GColorClear);
  text_layer_set_font(river_height_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(river_height_layer, GTextAlignmentLeft);
  text_layer_set_text(river_height_layer, "3.77");
  layer_add_child(window_layer, text_layer_get_layer(river_height_layer));

  river_temp_layer = text_layer_create(GRect(70, 140, 74, 28));
  text_layer_set_text_color(river_temp_layer, GColorWhite);
  text_layer_set_background_color(river_temp_layer, GColorClear);
  text_layer_set_font(river_temp_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(river_temp_layer, GTextAlignmentRight);
  text_layer_set_text(river_temp_layer, "68f");
  layer_add_child(window_layer, text_layer_get_layer(river_temp_layer));
/*
  Tuplet initial_values[] = {
    TupletCString(WEATHER_DESCR_KEY, "Surf"),
    TupletCString(WEATHER_TEMPERATURE_KEY, "99\u00B0C"),
    TupletCString(RIVER_HEIGHT_KEY, "0.0ft"),
    TupletCString(RIVER_TEMP_KEY, "00.0\u00B0C"),
    TupletCString(GAUGE_TIME_KEY, "00:00"),
  };

  app_sync_init(&sync, sync_buffer, sizeof(sync_buffer), initial_values, ARRAY_LENGTH(initial_values),
      NULL, NULL, NULL);
*/
  send_cmd();
}

static void window_unload(Window *window) {
  app_sync_deinit(&sync);
  text_layer_destroy(date_layer);
  text_layer_destroy(time_layer);
  text_layer_destroy(descr_layer);
  text_layer_destroy(gauge_time_layer);
  //text_layer_destroy(connection_layer);
  text_layer_destroy(temperature_layer);
  text_layer_destroy(river_height_layer);
  text_layer_destroy(river_temp_layer);
  
  layer_remove_from_parent(bitmap_layer_get_layer(bluetooth_layer));
	bitmap_layer_destroy(bluetooth_layer);
	gbitmap_destroy(bluetooth_image);
}

static void init(void) {
  
  // Register callbacks
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_register_outbox_sent(outbox_sent_callback);

  // Open AppMessage with sensible buffer sizes
  app_message_open(128, 64);
  
  window = window_create();
#ifdef PBL_COLOR
  window_set_background_color(window, GColorBlack );
#else
  window_set_background_color(window, GColorBlack);
#endif
  //window_set_fullscreen(window, true);
  window_set_window_handlers(window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload
  });
 
  const bool animated = true;
  window_stack_push(window, animated);
  tick_timer_service_subscribe(MINUTE_UNIT, handle_minute_tick);
  bluetooth_connection_service_subscribe(handle_bluetooth);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  bluetooth_connection_service_unsubscribe();
  window_destroy(window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
