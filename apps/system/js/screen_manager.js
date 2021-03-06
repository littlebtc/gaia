/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var ScreenManager = {
  /*
  * return the current screen status
  * Must not multate directly - use toggleScreen/turnScreenOff/turnScreenOn.
  * Listen to 'screenchange' event to properly handle status changes
  * This value can be "out of sync" with real mozPower value,
  * we do this to give screen some time to flash before actual turn off.
  */
  screenEnabled: true,

  _deviceLightEnabled: true,

  _brightness: 0.5,

  init: function scm_init() {
    /*
    * ScreenManager also handle the hardware keys on behalf of SleepMenu
    * XXX: Should move to the appropriate component.
    */
    window.addEventListener('keydown', this);
    window.addEventListener('keyup', this);

    /* Respect the information from DeviceLight sensor */
    window.addEventListener('devicelight', this);

    var self = this;

    SettingsListener.observe('screen.automatic-brightness', true,
    function deviceLightSettingChanged(value) {
      if (typeof value === 'string')
        value = (value == 'true');

      self.setDeviceLightEnabled(value);
    });

    SettingsListener.observe('screen.brightness', 0.5,
    function brightnessSettingChanged(value) {
      if (typeof value === 'string')
        value = parseFloat(value);

      self.setBrightness(value);
    });
  },

  handleEvent: function scm_handleEvent(evt) {
    this._syncScreenEnabledValue();
    switch (evt.type) {
      case 'devicelight':
        if (!this._deviceLightEnabled || !this.screenEnabled)
          return;

        // This is a rather naive but pretty effective heuristic
        var brightness =
          Math.max(Math.min((evt.value / 1100), this._brightness), 0.2);
        navigator.mozPower.screenBrightness = brightness;

        break;

      case 'keydown':
        if (evt.keyCode !== evt.DOM_VK_SLEEP && evt.keyCode !== evt.DOM_VK_HOME)
          return;

        this._turnOffScreenOnKeyup = true;
        if (!this.screenEnabled) {
          this.turnScreenOn();
          this._turnOffScreenOnKeyup = false;
        }

        if (evt.keyCode == evt.DOM_VK_SLEEP && !SleepMenu.visible) {
          this._sleepMenuTimeout = window.setTimeout((function slm_timeout() {
            SleepMenu.show();

            this._turnOffScreenOnKeyup = false;
          }).bind(this), 1500);
        }

        break;
      case 'keyup':
        if (evt.keyCode != evt.DOM_VK_SLEEP)
          return;

        window.clearTimeout(this._sleepMenuTimeout);

        if (this.screenEnabled && this._turnOffScreenOnKeyup) {
          SleepMenu.hide();
          this.turnScreenOff();
        }

        break;
    }
  },

  toggleScreen: function scm_toggleScreen() {
    this._syncScreenEnabledValue();
    if (this.screenEnabled)
      this.turnScreenOff();
    else
      this.turnScreenOn();
  },

  turnScreenOff: function scm_turnScreenOff() {
    this._syncScreenEnabledValue();
    if (!this.screenEnabled)
      return false;

    navigator.mozPower.screenBrightness = 0.0;

    this.screenEnabled = false;
    setTimeout(function realScreenOff() {
      navigator.mozPower.screenEnabled = false;
    }, 20);

    this.fireScreenChangeEvent();
    return true;
  },

  turnScreenOn: function scm_turnScreenOn() {
    this._syncScreenEnabledValue();
    if (this.screenEnabled)
      return false;

    navigator.mozPower.screenEnabled = this.screenEnabled = true;
    navigator.mozPower.screenBrightness = this._brightness;

    this.fireScreenChangeEvent();
    return true;
  },

  setBrightness: function scm_setBrightness(brightness) {
    this._brightness = brightness;

    /* Disregard devicelight value here and be responsive to setting changes.
    * Actual screen brightness will be updated shortly
    * with next devicelight event.
    */
    navigator.mozPower.screenBrightness = this._brightness;
  },

  setDeviceLightEnabled: function scm_setDeviceLightEnabled(enabled) {
    if (!enabled && this._deviceLightEnabled) {
      // Disabled -- set the brightness back to preferred brightness
      navigator.mozPower.screenBrightness = this._brightness;
    }
    this._deviceLightEnabled = enabled;
  },

  // XXX: this function is needed here because mozPower.screenEnabled
  // can be changed by shell.js instead of us.
  _syncScreenEnabledValue: function scm_syncScreenEnabledValue() {
    this.screenEnabled = navigator.mozPower.screenEnabled;
  },

  fireScreenChangeEvent: function scm_fireScreenChangeEvent() {
    var evt = document.createEvent('CustomEvent');
    evt.initCustomEvent('screenchange',
      /* canBubble */ true, /* cancelable */ false,
      {screenEnabled: this.screenEnabled});
    window.dispatchEvent(evt);
  }
};
