package com.coachleonidas.ledger;

import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // no stretch or glow when scrolling past the edge
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
