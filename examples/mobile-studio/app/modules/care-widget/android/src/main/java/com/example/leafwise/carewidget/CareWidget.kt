package com.example.leafwise.carewidget

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.Text
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

// Same contract as the iOS widget: the JS side writes plants due today, the widget reads them.
private const val PREFS = "leafwise.widget"
private const val DUE_KEY = "leafwise.widget.dueToday"
private const val PENDING_KEY = "leafwise.widget.pending"
private val PLANT_ID = ActionParameters.Key<String>("plantId")

private fun due(context: Context): List<Pair<String, String>> {
  val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(DUE_KEY, "[]")
  val arr = JSONArray(raw)
  return (0 until arr.length()).map { arr.getJSONObject(it).let { o -> o.getString("id") to o.getString("name") } }
}

class CareWidget : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val plants = due(context).take(3)
    provideContent {
      Column(GlanceModifier.padding(12.dp)) {
        Text(if (plants.isEmpty()) "All watered" else "Due today")
        plants.forEach { (plantId, name) ->
          Row {
            Text(name)
            Text(
              "Water",
              GlanceModifier
                .semantics { contentDescription = "Mark $name as watered" }
                .padding(start = 12.dp),
            )
          }
        }
      }
    }
  }
}

class MarkWatered : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val pending = prefs.getStringSet(PENDING_KEY, emptySet())!!.toMutableSet()
    parameters[PLANT_ID]?.let { pending.add(it) }
    prefs.edit().putStringSet(PENDING_KEY, pending).apply()
    CareWidget().updateAll(context)
  }
}

class CareWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = CareWidget()
}

// Called from JS after each sync so the widget never shows stale plants.
class CareWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CareWidget")
    AsyncFunction("setDueToday") { json: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(DUE_KEY, json).apply()
    }
    AsyncFunction("takePending") {
      val prefs = appContext.reactContext!!.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val ids = prefs.getStringSet(PENDING_KEY, emptySet())!!.toList()
      prefs.edit().remove(PENDING_KEY).apply()
      ids
    }
  }
}

@Suppress("unused")
private fun waterAction(plantId: String) = actionRunCallback<MarkWatered>(actionParametersOf(PLANT_ID to plantId))
